function getFreeling(text, cb) {
	var cacheKey = "cache.freeling." + text;
	async.waterfall([
		function(cb) {
			if (cacheKey.length > 256) {
				return cb(null, null);
			}
			keyFromLocal(cacheKey, cb);
		},
		function(data, cb) {
			if (data) {
				return cb(null, data);
			}
			$.ajax({
				url: "http://127.0.0.1:8080/freeling-es-json",
				type: "POST",
				data: { "text": text },
			})
			.done(function(data) {
				keyToLocal(cacheKey, data, cb);
			})
			.fail(function(jq, textStatus) { cb(textStatus) });
		},
	], cb);
}

function textToLemmas(text, cb) {
	async.waterfall([
		function(cb) { getFreeling(text, cb) },
		function(data, cb) {
			var result = {
				uniq: [],
				list: [],
			};
			var uniq = {};
			for (var i in data) {
				var para = data[i];
				for (var j in para.tokens) {
					var token = para.tokens[j];
					uniq[token.ctag + ":::" + token.lemma] = token;
					result.list.push(token);
				}
			}
			for (var key in uniq) {
				result.uniq.push(uniq[key]);
			}
			return cb(null, result);
		},
	], cb);
}

// addLemas takes a card struct like { word: "foo bar" } and passes the text
// to freeling, adding { lemmas: ["foo", "bar"], tags: [ { ... }, ... ] }.
function addLemmas(result, cb) {
	if (!result.word) {
		return cb("Invalid object: missing 'word' property");
	}
	async.waterfall([
		function(cb) { getFreeling(result.word, cb) },
		function(data, cb) {
			var uniqLemmas = {};
			result.tags = [];
			for (var i in data) {
				var para = data[i];
				for (var j in para.tokens) {
					var token = para.tokens[j];
					uniqLemmas[token.lemma] = true;
					result.tags.push({
						// Copy in only the relevant data.
						form: token.form,
						lemma: token.lemma,
						tag: token.tag,
					});
				}
			}

			result.lemmas = [];
			for (var l in uniqLemmas) {
				result.lemmas.push(l);
			}
			cb(null, result);
		},
	], cb);
}

function cbLogger(err, result) {
	if (err) {
		console.error(err);
		return;
	}
	console.log(result);
	window.cbLogRes = result;
}

function keyFromStorageArea(area, key, cb) {
	area.get(key, function(data) {
		if (chrome.runtime.lastError) {
			return cb(chrome.runtime.lastError);
		}
		return cb(null, data[key]);
	});
}

function keyToStorageArea(area, key, value, cb) {
	var data = {};
	data[key] = value;
	area.set(data, function() {
		if (chrome.runtime.lastError) {
			return cb(chrome.runtime.lastError);
		}
		return cb(null, value);
	});
}

function keyFromLocal(key, cb) {
	return keyFromStorageArea(chrome.storage.local, key, cb);
}

function keyToLocal(key, value, cb) {
	return keyToStorageArea(chrome.storage.local, key, value, cb);
}

function keyFromSync(key, cb) {
	return keyFromStorageArea(chrome.storage.sync, key, cb);
}

function keyToSync(key, value, cb) {
	return keyToStorageArea(chrome.storage.sync, key, value, cb);
}

var forceCache;

function fetchURL(options, cb) {
	var key = "fetchURL." + options.url;
	async.waterfall([
		function(cb) {
			if (forceCache !== undefined) {
				options.cache = forceCache;
			}
			if (options.cache === false) {
				return cb(null, undefined);
			}
			keyFromLocal(key, cb);
		},
		function(content, cb) {
			if (content !== undefined) {
				return cb(null, content);
			}
			console.log("Retrieving " + key);
			$.ajax({
					url: options.url,
					type: "GET",
					dataType: "html",
				})
				.done(function(data) {
					keyToLocal(key, data, cb);
				})
				.fail(function(jq, textStatus) { cb(textStatus) });
		}
	], function(err, result) {
		if (err) {
			console.error("fetchURL " + options.url + " failed: " + err);
		}
		if (!options.keepImages) {
			result = stripImages(result);
		}
		cb(err, result);
	});
}

function stripImages(content) {
	return content.replace(/<img.+?>/gi, "");
}
