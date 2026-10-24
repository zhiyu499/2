class HipmhSource extends ComicSource {
    name = "嬉皮漫畫";
    key = "hipmh";
    version = "1.8.0";
    minAppVersion = "1.16.0";
    url = "https://raw.githubusercontent.com/zhiyu499/2/main/hipmh.js";

    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
        "Referer": "https://m.hipmh.com/"
    };

    search = {
        optionList: [],
        load: async (keyword, options, page) => {
            const data = await this.getJson("https://hipapi1.s3file.top/v1/search?q=" + encodeURIComponent(keyword || "") + "&page=" + page + "&page_size=30");
            const items = data.data && (data.data.data || data.data.items || data.data) || [];
            const comics = [];
            for (const item of items) {
                comics.push(new Comic({
                    id: String(item.id || item.mid || item.slug),
                    title: item.title || item.name || "未命名",
                    cover: this.coverUrl(item.vertical_image_url || item.cover_image_url || ""),
                    subtitle: this.joinNames(item.author_names || item.authors),
                    tags: this.joinNames(item.genres).split("、").filter(Boolean)
                }));
            }
            return { comics, maxPage: comics.length >= 30 ? page + 1 : page };
        }
    };

    explore = [{
        title: "首頁推薦",
        type: "multiPageComicList",
        load: async page => {
            const html = await this.getText(page === 1 ? "https://m.hipmh.com/" : "https://m.hipmh.com/?page=" + page);
            const doc = new HtmlDocument(html);
            try {
                const comics = this.parseComicCards(doc);
                return { comics, maxPage: this.parseMaxPage(doc, page, comics.length) };
            } finally {
                doc.dispose();
            }
        }
    }, {
        title: "人氣榜",
        type: "multiPageComicList",
        load: async page => {
            const html = await this.getText("https://m.hipmh.com/popularity?page=" + page);
            const doc = new HtmlDocument(html);
            try {
                const comics = this.parseComicCards(doc);
                return { comics, maxPage: this.parseMaxPage(doc, page, comics.length) };
            } finally {
                doc.dispose();
            }
        }
    }];

    category = {
        title: "嬉皮漫畫分類",
        parts: [{
            name: "題材分類",
            type: "fixed",
            categories: [
                { label: "國漫", target: { page: "category", attributes: { category: "國漫", param: "category/cn" } } },
                { label: "韓漫", target: { page: "category", attributes: { category: "韓漫", param: "category/ko" } } },
                { label: "武俠", target: { page: "category", attributes: { category: "武俠", param: "genre/wu-xia" } } },
                { label: "系統", target: { page: "category", attributes: { category: "系統", param: "genre/xi-tong" } } },
                { label: "冒險", target: { page: "category", attributes: { category: "冒險", param: "genre/mao-xian" } } },
                { label: "異能", target: { page: "category", attributes: { category: "異能", param: "genre/yi-neng" } } },
                { label: "劇情", target: { page: "category", attributes: { category: "劇情", param: "genre/ju-qing" } } },
                { label: "宮鬥", target: { page: "category", attributes: { category: "宮鬥", param: "genre/gong-dou" } } },
                { label: "逆襲", target: { page: "category", attributes: { category: "逆襲", param: "genre/ni-xi" } } }
            ]
        }],
        enableRankingPage: false
    };

    categoryComics = {
        optionList: [],
        load: async (category, param, options, page) => {
            const path = String(param || "").replace(/^\/+/, "");
            const html = await this.getText("https://m.hipmh.com/" + path + "?page=" + page);
            const doc = new HtmlDocument(html);
            try {
                const comics = this.parseComicCards(doc);
                return { comics, maxPage: this.parseMaxPage(doc, page, comics.length) };
            } finally {
                doc.dispose();
            }
        }
    };

    comic = {
        loadInfo: async id => {
            const url = id.indexOf("http") === 0 ? id : "https://m.hipmh.com/works/" + id;
            const html = await this.getText(url);
            const doc = new HtmlDocument(html);
            try {
                const title = this.firstText(doc, ["h1", ".work-title", ".comic-title", "title"]);
                const cover = this.extractMetaContent(html, "og:image") ||
                    this.extractMetaContent(html, "twitter:image") ||
                    this.extractMetaContent(html, "msapplication-TileImage") ||
                    this.firstAttr(doc, [".cover img", ".work-cover img", "img"], ["content", "data-src", "data-original", "src"]);
                const description = this.firstText(doc, ["meta[name='description']", ".description", ".work-description", ".intro"]);
                const tags = {};
                const genre = this.texts(doc, [".genres a", ".tags a", ".tag a"]);
                if (genre.length) tags["tag"] = genre;
                const authors = this.texts(doc, [".author a", ".authors a", "a[href*='/author/']"]);
                if (authors.length) tags["author"] = authors;

                const mid = this.numericMangaId(id);
                const chapters = await this.loadChapterDirectory(mid);
                const coverUrl = cover ? this.coverUrl(cover) : "";
                log("info", "嬉皮漫画封面地址", JSON.stringify({ source: cover, resolved: coverUrl }));
                return {
                    title: title || id,
                    cover: coverUrl,
                    description: description || "",
                    tags,
                    chapters: Object.keys(chapters).length ? chapters : null
                };
            } finally {
                doc.dispose();
            }
        },

        loadEp: async (comicId, epId) => {
            if (typeof epId !== "string" || epId.indexOf("ep_") !== 0) throw new Error("无法识别嬉皮漫画章节编号，请重新打开作品目录");
            const chapterNumericId = epId.slice(3);
            const mid = this.numericMangaId(comicId);
            if (!mid || !chapterNumericId) throw new Error("嬉皮漫画目录编号无效，请重新打开作品目录");
            const hid = chapterNumericId.indexOf("hid_") === 0 ? chapterNumericId.slice(4) : this.makeChapterHid(mid, chapterNumericId);
            const readerHtml = await this.getText("https://reader.hipmh.top/chapter/" + encodeURIComponent(hid) + "?m=" + encodeURIComponent(mid), { "Referer": "https://m.hipmh.com/" });
            const pageData = this.readChapterAttributes(readerHtml);
            if (!pageData.apiHid) throw new Error("无法读取章节接口参数，嬉皮漫画阅读页可能已改版");
            const apiBase = (pageData.apiBase || "https://hipapi1.s3file.top").replace(/\/$/, "").replace(/\/v\d+$/, "") + "/v2";
            const result = await this.getJson(apiBase + "/chapter?hid=" + encodeURIComponent(pageData.apiHid), { "Referer": "https://reader.hipmh.top/" });
            if (result.code !== 200 || !result.data) throw new Error("嬉皮漫画章节接口未返回章节数据");
            let decoded = result.data.images;
            if (!Array.isArray(decoded)) decoded = await this.decodeImageList(decoded);
            const images = decoded.map(item => this.absoluteUrl(typeof item === "string" ? item : item.url || item.src || item.path || "", pageData.imageBase || "https://reader.hipmh.top/")).filter(Boolean);
            if (!images.length) throw new Error("嬉皮漫画章节图片为空");
            return { images };
        },
        onImageLoad: imageKey => ({ url: imageKey, headers: Object.assign({}, this.headers, { "Referer": "https://reader.hipmh.top/" }) }),
        onThumbnailLoad: imageKey => ({ url: this.coverUrl(imageKey), headers: Object.assign({}, this.headers, { "Referer": "https://m.hipmh.com/" }) })
    };

    getText = async (url, extraHeaders) => {
        const response = await Network.get(url, Object.assign({}, this.headers, extraHeaders || {}));
        if (response.status < 200 || response.status >= 400) throw new Error("嬉皮漫畫请求失败：HTTP " + response.status);
        return response.body;
    };

    getJson = async (url, headers) => JSON.parse(await this.getText(url, Object.assign({ "Accept": "application/json" }, headers || {})));

    loadChapterDirectory = async mid => {
        if (!mid) return {};
        const pageSize = 100;
        const first = await this.getJson("https://hipapi1.s3file.top/v1/manga/chapters?mid=" + encodeURIComponent(mid) + "&page=1&per_page=" + pageSize + "&order=desc", { "Referer": "https://m.hipmh.com/" });
        const payload = first.data || {};
        let rows = payload.items || payload.data || [];
        if (!Array.isArray(rows)) rows = [];
        const total = Number(payload.total) || rows.length;
        const pages = Math.min(100, Math.ceil(total / pageSize));
        for (let page = 2; page <= pages; page++) {
            const result = await this.getJson("https://hipapi1.s3file.top/v1/manga/chapters?mid=" + encodeURIComponent(mid) + "&page=" + page + "&per_page=" + pageSize + "&order=desc", { "Referer": "https://m.hipmh.com/" });
            const next = result.data && (result.data.items || result.data.data) || [];
            if (!Array.isArray(next) || !next.length) break;
            rows = rows.concat(next);
        }
        const chapters = {};
        rows.reverse();
        for (const row of rows) {
            const directHid = row.frontend_hid || row.frontendHid || row.hid || "";
            const chapterId = directHid ? "hid_" + directHid : String(row.id || row.chapter_id || row.cid || row.chapterId || "");
            if (!chapterId) continue;
            const title = String(row.title || row.name || (row.chapter_number ? "第 " + row.chapter_number + " 話" : chapterId)).replace(/^\[([^\]]+)\]\s*/, "$1 ").trim();
            chapters["ep_" + chapterId] = title;
        }
        return chapters;
    };

    numericMangaId = id => {
        const prefix = String(id || "").split("-")[0];
        if (!prefix) return "";
        try {
            let base64 = prefix.replace(/-/g, "+").replace(/_/g, "/");
            while (base64.length % 4) base64 += "=";
            const decoded = Convert.decodeUtf8(Convert.decodeBase64(base64));
            return decoded.indexOf("m:") === 0 ? decoded.slice(2) : "";
        } catch (_) { return ""; }
    };

    makeChapterHid = (mid, chapterId) => {
        const encode = value => Convert.encodeBase64(Convert.encodeUtf8(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
        return encode("m:" + mid + "-c:" + chapterId) + "-" + encode(mid + ":1.00");
    };

    joinNames = values => (values || []).map(value => typeof value === "string" ? value : value.name || "").filter(Boolean).join("、");

    queryParam = (url, name) => {
        const match = String(url).match(new RegExp("[?&]" + name + "=([^&#]+)"));
        if (!match) return "";
        try { return decodeURIComponent(match[1].replace(/\+/g, "%20")); } catch (_) { return match[1]; }
    };

    readChapterAttributes = html => {
        const tag = String(html).match(/<[^>]+id=["']chapcontent["'][^>]*>/i);
        const attrs = {};
        if (!tag) return { apiHid: "", apiBase: "", imageBase: "" };
        const re = /([\w-]+)=["']([^"']*)["']/g;
        let match;
        while ((match = re.exec(tag[0]))) attrs[match[1]] = match[2];
        return {
            apiHid: attrs["data-api-hid"] || "",
            apiBase: attrs["data-api-base-url-line1"] || attrs["data-api-base-url"] || "",
            imageBase: attrs["data-chapter-img-base-line1"] || attrs["data-chapter-img-base"] || ""
        };
    };

    decodeImageList = async encoded => {
        if (!encoded) return [];
        const code = await this.getText("https://reader.hipmh.top/assets/runtime/chapter-decoder.js", { "Referer": "https://reader.hipmh.top/" });
        let globalObject;
        let originalAtob;
        let originalBtoa;
        let originalTextDecoder;
        try {
            const decodeBase64 = value => {
                let normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
                while (normalized.length % 4) normalized += "=";
                const buffer = Convert.decodeBase64(normalized);
                const bytes = new Uint8Array(buffer);
                let binary = "";
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                return binary;
            };
            const encodeBase64 = value => {
                const binary = String(value);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 255;
                return Convert.encodeBase64(bytes.buffer);
            };
            class TextDecoderShim {
                constructor(encoding) { this.encoding = encoding || "utf-8"; }
                decode(input) {
                    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
                    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                    return Convert.decodeUtf8(buffer);
                }
            }
            const decoderWindow = { atob: decodeBase64, btoa: encodeBase64, TextDecoder: TextDecoderShim };
            // The site's bundled decoder uses a nested Function, so formal parameters
            // and window.atob are not visible to it. Install shims on the JS global
            // object for the duration of decoding, then restore the runtime globals.
            globalObject = Function("return this")();
            originalAtob = globalObject.atob;
            originalBtoa = globalObject.btoa;
            originalTextDecoder = globalObject.TextDecoder;
            globalObject.atob = decodeBase64;
            globalObject.btoa = encodeBase64;
            globalObject.TextDecoder = TextDecoderShim;
            const decoder = new Function("window", "atob", "btoa", code + "\n; return window.__cimg;")(
                decoderWindow, decodeBase64, encodeBase64
            );
            if (decoder && typeof decoder.r === "function") return await decoder.r(encoded);
        } catch (error) {
            throw new Error("嬉皮漫画图片数据解码失败：" + (error && error.message ? error.message : String(error)));
        } finally {
            if (globalObject) {
                if (originalAtob === undefined) delete globalObject.atob;
                else globalObject.atob = originalAtob;
                if (originalBtoa === undefined) delete globalObject.btoa;
                else globalObject.btoa = originalBtoa;
                if (originalTextDecoder === undefined) delete globalObject.TextDecoder;
                else globalObject.TextDecoder = originalTextDecoder;
            }
        }
        throw new Error("嬉皮漫画图片数据解码失败");
    };

    parseComicCards = doc => {
        const comics = [];
        const seen = {};
        for (const a of doc.querySelectorAll("a[href*='/works/']")) {
            const href = a.attributes["href"];
            const title = (a.text || a.attributes["title"] || "").trim();
            if (!href || !title) continue;
            const full = this.absoluteUrl(href);
            const id = full.replace(/^https?:\/\/m\.hipmh\.com\/works\//, "");
            if (seen[id] || !id) continue;
            seen[id] = true;
            const img = a.querySelector("img");
            const cover = img && (img.attributes["data-src"] || img.attributes["data-original"] || img.attributes["src"]);
            comics.push(new Comic({ id, title, cover: cover ? this.coverUrl(cover) : "" }));
        }
        return comics;
    };

    parseMaxPage = (doc, current, count) => {
        let max = current;
        for (const a of doc.querySelectorAll("a[href*='page=']")) {
            const href = a.attributes["href"] || "";
            const match = href.match(/[?&]page=(\d+)/);
            if (match) max = Math.max(max, Number(match[1]));
        }
        return count < 1 ? current : Math.max(max, current + (count >= 20 ? 1 : 0));
    };

    firstText = (doc, selectors) => {
        for (const selector of selectors) {
            const el = doc.querySelector(selector);
            if (!el) continue;
            const value = selector.indexOf("meta[") === 0 ? el.attributes["content"] : el.text;
            if (value && value.trim()) return value.trim();
        }
        return "";
    };

    firstAttr = (doc, selectors, attrs) => {
        for (const selector of selectors) {
            const el = doc.querySelector(selector);
            if (!el) continue;
            for (const attr of attrs) if (el.attributes[attr]) return el.attributes[attr];
        }
        return "";
    };

    extractMetaContent = (html, key) => {
        const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
        const wanted = String(key || "").toLowerCase();
        for (const tag of tags) {
            const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i);
            if (!name || name[1].toLowerCase() !== wanted) continue;
            const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
            if (content) return content[1].replace(/&amp;/gi, "&");
        }
        return "";
    };

    texts = (doc, selectors) => {
        const values = [];
        for (const selector of selectors) for (const el of doc.querySelectorAll(selector)) {
            const value = (el.text || "").trim();
            if (value && values.indexOf(value) < 0) values.push(value);
        }
        return values;
    };

    absoluteUrl = (value, base) => {
        if (/^https?:\/\//i.test(value)) return value;
        if (value.indexOf("//") === 0) return "https:" + value;
        const origin = base || "https://m.hipmh.com";
        return origin.replace(/\/$/, "") + (value.charAt(0) === "/" ? value : "/" + value);
    };

    coverUrl = value => {
        const path = String(value || "").trim();
        if (!path) return "";
        const imageHost = /^\/(?:kk|asa|webtoon|dongman|picy)\//i.test(path) ? "https://cover.s3imgs.top" : "https://m.hipmh.com";
        return this.absoluteUrl(path, imageHost);
    };

    safeKey = value => String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}
