.pragma library
.import QtQuick.LocalStorage 2.0 as LS

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function apiGet(url, apiKey, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.setRequestHeader("x-api-key", apiKey);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.onreadystatechange = function() {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        if (xhr.status === 200) {
            try {
                callback(null, JSON.parse(xhr.responseText));
            } catch (e) {
                callback("JSON parse error: " + e.message, null);
            }
        } else {
            callback("HTTP " + xhr.status + " — " + url, null);
        }
    };
    xhr.send();
}

function apiPost(url, apiKey, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("x-api-key", apiKey);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.onreadystatechange = function() {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        if (xhr.status === 200) {
            try {
                callback(null, JSON.parse(xhr.responseText));
            } catch (e) {
                callback("JSON parse error: " + e.message, null);
            }
        } else {
            callback("HTTP " + xhr.status + " — " + url, null);
        }
    };
    xhr.send(JSON.stringify(body));
}

// Load an image URL as a base64 data URI so we can set it on QML Image.source
// (QML Image cannot send custom HTTP headers, so we use XHR + arraybuffer).
function loadImageAsDataUri(url, apiKey, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.setRequestHeader("x-api-key", apiKey);
    xhr.responseType = "arraybuffer";
    xhr.onreadystatechange = function() {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        if (xhr.status === 200) {
            // Use the actual Content-Type so WebP/PNG thumbnails work too.
            var mime = (xhr.getResponseHeader("Content-Type") || "image/jpeg")
                           .split(";")[0].trim();

            // Build binary string in 8 KB chunks to avoid call-stack overflow
            // on large preview images (String.fromCharCode.apply has a limit).
            var arr = new Uint8Array(xhr.response);
            var binary = "";
            var chunkSize = 8192;
            for (var i = 0; i < arr.byteLength; i += chunkSize) {
                binary += String.fromCharCode.apply(
                    null, arr.subarray(i, Math.min(i + chunkSize, arr.byteLength))
                );
            }
            // btoa() is the standard JS global; Qt.btoa() is the QML alias.
            // Use whichever is available — .pragma library may not expose Qt.*
            var b64 = (typeof btoa === "function") ? btoa(binary)
                    : (Qt && Qt.btoa)               ? Qt.btoa(binary)
                    : _btoa(binary);
            callback(null, "data:" + mime + ";base64," + b64);
        } else {
            callback("HTTP " + xhr.status + " — " + url, null);
        }
    };
    xhr.send();
}

// ---------------------------------------------------------------------------
// Asset fetchers
// ---------------------------------------------------------------------------

// Extract asset items from a POST /api/search/metadata response.
// Response shape: { assets: { items: [...], count, nextPage } }
function _searchAssets(data) {
    if (Array.isArray(data)) return data;
    if (data && data.assets) {
        if (Array.isArray(data.assets.items)) return data.assets.items;
        if (Array.isArray(data.assets))       return data.assets;
    }
    return [];
}

// Paginate through every page of a /api/search/metadata query.
// Pass count=null to fetch all; otherwise stops after the first page of `count`.
// Safety cap: 100 pages (100 000 photos at size=1000).
function _metadataSearch(serverUrl, apiKey, baseBody, count, accumulated, page, callback) {
    var body = JSON.parse(JSON.stringify(baseBody));
    body.page = page;
    body.size = count ? count : 1000;

    apiPost(serverUrl + "/api/search/metadata", apiKey, body, function(err, data) {
        if (err) { callback(err, null); return; }
        var items = _searchAssets(data);
        var all   = accumulated.concat(items);

        // Stop if: single-page request, no more pages, or safety cap reached
        var nextPage = data && data.assets && data.assets.nextPage;
        if (!count && nextPage && items.length > 0 && page < 100) {
            _metadataSearch(serverUrl, apiKey, baseBody, null, all, page + 1, callback);
        } else {
            callback(null, all);
        }
    });
}

// count=null → fetch all pages
function fetchRecent(serverUrl, apiKey, count, callback) {
    _metadataSearch(serverUrl, apiKey, { type: "IMAGE" }, count, [], 1, callback);
}

function fetchFavorites(serverUrl, apiKey, count, callback) {
    _metadataSearch(serverUrl, apiKey, { type: "IMAGE", isFavorite: true }, count, [], 1, callback);
}

function fetchRandom(serverUrl, apiKey, count, callback) {
    apiPost(serverUrl + "/api/search/random", apiKey,
            { size: count, type: "IMAGE" },
            function(err, data) {
                if (err) { callback(err, null); return; }
                var assets = Array.isArray(data) ? data : _searchAssets(data);
                callback(null, assets);
            });
}

function fetchAlbum(serverUrl, apiKey, albumId, callback) {
    // albumId may be a single ID or comma-separated list of IDs
    var ids = albumId.split(",").map(function(s) { return s.trim(); })
                     .filter(function(s) { return s !== ""; });
    if (ids.length === 0) { callback("No album selected", null); return; }

    // Immich v3 removed the `assets` property from GET /api/albums/{id}.
    // Use POST /api/search/metadata with albumIds per album and merge results.
    // (albumIds in search/metadata is AND, so we must query each album separately
    //  to get a union of all photos across albums.)
    var merged = {};
    var pending = ids.length;
    var done = false;

    ids.forEach(function(id) {
        _metadataSearch(serverUrl, apiKey, { albumIds: [id] }, null, [], 1,
            function(err, assets) {
                if (done) return;
                if (err) { done = true; callback(err, null); return; }
                for (var i = 0; i < assets.length; i++) {
                    merged[assets[i].id] = assets[i];
                }
                if (--pending === 0) {
                    done = true;
                    var result = [];
                    for (var key in merged) result.push(merged[key]);
                    callback(null, result);
                }
            });
    });

}

// count=null → fetch all pages
function fetchPerson(serverUrl, apiKey, personId, count, callback) {
    var ids = personId.split(",").map(function(s) { return s.trim(); })
                      .filter(function(s) { return s !== ""; });
    if (ids.length === 0) { callback("No person selected", null); return; }

    if (ids.length === 1) {
        // Single person — straightforward
        _metadataSearch(serverUrl, apiKey, { type: "IMAGE", personIds: [ids[0]] },
                        count, [], 1, callback);
        return;
    }

    // Multiple people with OR logic: fetch each person separately then merge.
    // Passing all IDs to personIds[] gives AND (photos with every person); we
    // want OR (photos with any person), so we fan out and deduplicate.
    var merged = {};   // keyed by asset id for dedup
    var pending = ids.length;
    var done    = false;

    ids.forEach(function(id) {
        _metadataSearch(serverUrl, apiKey, { type: "IMAGE", personIds: [id] },
                        count, [], 1, function(err, assets) {
            if (done) return;
            if (err) { done = true; callback(err, null); return; }
            assets.forEach(function(a) { merged[a.id] = a; });
            if (--pending === 0) {
                done = true;
                callback(null, Object.keys(merged).map(function(k) { return merged[k]; }));
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Picker helpers (used in config pages)
// ---------------------------------------------------------------------------

function fetchAlbums(serverUrl, apiKey, callback) {
    apiGet(serverUrl + "/api/albums", apiKey, callback);
}

function fetchPeople(serverUrl, apiKey, callback) {
    apiGet(serverUrl + "/api/people", apiKey, function(err, data) {
        if (err) { callback(err, null); return; }
        var people = Array.isArray(data) ? data : (data.people || []);
        callback(null, people);
    });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function fisherYates(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(Qt.locale(), Locale.ShortFormat);
}

function formatCaption(asset) {
    if (!asset) return "";
    var parts = [];
    var exif = asset.exifInfo;
    if (exif) {
        if (exif.dateTimeOriginal) {
            parts.push(formatDate(exif.dateTimeOriginal));
        }
        if (exif.city) {
            parts.push(exif.city);
        } else if (exif.state) {
            parts.push(exif.state);
        } else if (exif.country) {
            parts.push(exif.country);
        }
    } else if (asset.localDateTime) {
        parts.push(formatDate(asset.localDateTime));
    }
    return parts.join(" · ");
}

function todayString(resetHour) {
    var d = new Date();
    // If we haven't yet reached the reset hour, we're still in the previous "day"
    if (resetHour && d.getHours() < resetHour) {
        d.setDate(d.getDate() - 1);
    }
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

// ---------------------------------------------------------------------------
// LocalStorage persistence for Daily Photo
// ---------------------------------------------------------------------------

function _getDb() {
    return LS.LocalStorage.openDatabaseSync(
        "ImmichGallery", "1.0", "Immich Gallery Daily Photo", 65536
    );
}

function saveDailyPhoto(assetId, date) {
    var db = _getDb();
    db.transaction(function(tx) {
        tx.executeSql(
            "CREATE TABLE IF NOT EXISTS daily (id TEXT NOT NULL, date TEXT NOT NULL)"
        );
        tx.executeSql("DELETE FROM daily");
        tx.executeSql("INSERT INTO daily VALUES (?, ?)", [assetId, date]);
    });
}

function loadDailyPhoto() {
    var db = _getDb();
    var result = null;
    // Use a regular (read-write) transaction so CREATE TABLE IF NOT EXISTS works
    // even on first run when the table does not yet exist.
    db.transaction(function(tx) {
        tx.executeSql(
            "CREATE TABLE IF NOT EXISTS daily (id TEXT NOT NULL, date TEXT NOT NULL)"
        );
        var rs = tx.executeSql("SELECT id, date FROM daily LIMIT 1");
        if (rs.rows.length > 0) {
            result = { id: rs.rows.item(0).id, date: rs.rows.item(0).date };
        }
    });
    return result;
}

// ---------------------------------------------------------------------------
// Pure-JS base64 encoder — fallback when neither btoa() nor Qt.btoa() is
// available (can happen in .pragma library context on some Qt 6 builds).
// ---------------------------------------------------------------------------
var _b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function _btoa(str) {
    var out = "", len = str.length;
    for (var i = 0; i < len; i += 3) {
        var c0 = str.charCodeAt(i);
        var c1 = (i + 1 < len) ? str.charCodeAt(i + 1) : 0;
        var c2 = (i + 2 < len) ? str.charCodeAt(i + 2) : 0;
        out += _b64chars[c0 >> 2];
        out += _b64chars[((c0 & 3) << 4) | (c1 >> 4)];
        out += (i + 1 < len) ? _b64chars[((c1 & 15) << 2) | (c2 >> 6)] : "=";
        out += (i + 2 < len) ? _b64chars[c2 & 63] : "=";
    }
    return out;
}
