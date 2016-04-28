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

function fetchURL(options, cb) {
	var key = "fetchURL." + options.url;
	async.waterfall([
		function(cb) {
			if (options.cache === false) {
				return cb(null, undefined);
			}
			keyFromLocal(key, cb);
		},
		function(content, cb) {
			if (content !== undefined) {
				console.log("Found " + key + " in local datastore");
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
				.fail(function(jq, textStatus, errorThrown) { cb(textStatus) });
		}
	], function(err, result) {
		if (err) {
			console.error("fetchURL " + options.url + " failed: " + err);
		}
		cb(err, result);
	});
}
