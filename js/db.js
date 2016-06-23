const dbName = "flashcards",
	dbVersion = 1,
	osSets = "sets",
	osCards = "cards",
	idxLemmas = "lemmas";

const dbStructure = {
	cards: [
		{
			set: "set1",
			word: "Los árboles",
			definition: "Trees",
			// idxLemmas on this field:
			lemmas: ["el", "arbol"],
			tags: [
				{ form: "Los", lemma: "el", tag: "DA0MP0" },
				{ form: "árboles", lemma: "árbol", tag: "NCMP000" },
			],
		},
	],
	sets: {
		set1: {
			id: "quizlet/chapter1",
			url: "...",
			title: "...",
		},
	},
};

function attachTransaction(t, cb) {
	t.oncomplete = function() { cb(null) };
	t.onerror = function(evt) { cb(evt.target.error) };
}

function attachRequest(r, cb) {
	r.onsuccess = function() { cb(null) };
	r.onerror = function(evt) { cb(evt.target.error) };
}

function openDefaultDatabase(cb) {
	return openDatabase(dbName, dbVersion, cb);
}

function openDatabase(name, version, cb) {
	var req = indexedDB.open(name, version);
	req.onerror = function() {
		cb("db open failed: " + req.target.error);
	};
	req.onupgradeneeded = function(evt) {
		var db = req.result;
		console.log("Database " + name + " needs upgrade from " + evt.oldVersion + " -> " + evt.newVersion);
		if (evt.oldVersion < 1) {
			db.createObjectStore(osSets, { keyPath: "id" });
			var cards = db.createObjectStore(osCards, { autoIncrement: true });
			cards.createIndex(idxLemmas, "lemmas", { multiEntry: true });
		}
		// onsuccess will follow.
	};
	req.onsuccess = function() {
		cb(null, req.result);
	};
}

function cardsWithLemma(lemma, db, cb) {
	var t = db.transaction([osCards]);
	attachTransaction(t, cb);

	var result = [];
	t.oncomplete = function() { cb(null, result) };

	var idx = t.objectStore(osCards).index(idxLemmas);
	idx.openCursor(IDBKeyRange.only(lemma)).onsuccess = function(evt) {
		var cursor = evt.target.result;
		if (!cursor) {
			return;
		}
		result.push(cursor.value);
		cursor.continue();
	};
}

function cardsMatching(regex, db, cb) {
	var t = db.transaction([osCards]);
	attachTransaction(t, cb);

	var result = [];
	t.oncomplete = function() { cb(null, result) };

	t.objectStore(osCards).openCursor().onsuccess = function(event) {
		var cursor = event.target.result;
		if (!cursor) {
			return;
		}
		if (cursor.value.definition.match(regex) !== null ||
			cursor.value.word.match(regex) !== null) {
			result.push(cursor.value);
		}
		cursor.continue();
	};
}

function unknownLemmas(text, cb) {
	if (cb === undefined) {
		cb = cbLogger;
	}
	var db;
	async.waterfall([
		openDefaultDatabase,
		function(_db, cb) {
			db = _db;
			textToLemmas(text, cb);
		},
		function(result, cb) {
			var byLemma = {};
			for (var i in result.uniq) {
				var token = result.uniq[i];
				if (token.pos === "punctuation" ||
					token.pos === "date" ||
					token.pos === "number") {
					continue;
				}
				if (token.pos === "noun" && token.type === "proper") {
					continue;
				}
				if (byLemma[token.lemma] === undefined) {
					byLemma[token.lemma] = [];
				}
				byLemma[token.lemma].push(token);
			}

			var records = [];
			for (var lemma in byLemma) {
				records.push({
					lemma: lemma,
					tokens: byLemma[lemma],
				});
			}

			async.mapSeries(records, function(record, cb) {
				cardsWithLemma(record.lemma, db, function (err, result) {
					if (err) {
						return cb(err);
					}
					record.cards = result;
					return cb(null, record);
				});
			}, cb);
		},
		function (records, cb) {
			var byPOS = {};
			for (var i in records) {
				var record = records[i];
				// Skip looking at any lemmas that are in any flashcards,
				// regardless of what part of speech they are. This is naive.
				if (record.cards.length > 0) {
					continue;
				}
				for (var j in record.tokens) {
					var token = record.tokens[j];
					if (byPOS[token.pos] === undefined) {
						byPOS[token.pos] = [];
					}
					byPOS[token.pos].push(token);
				}
			}

			var all = [];
			for (var pos in byPOS) {
				var set = {};
				for (var i in byPOS[pos]) {
					set[ byPOS[pos][i].lemma ] = true;
				}
				var lemmas = [];
				for (var lemma in set) {
					var l = lemma.replace(/_/g, " ");
					lemmas.push(l);
					all.push(l);
				}
				lemmas.sort();
				console.log("Part of speech: " + pos);
				console.log("   " + lemmas.join(", "));
			}

			async.mapSeries(all, function(lemma, cb) {
				sdictDefineWord(lemma, function(err, result) {
					if (err) {
						return cb(err);
					}
					result.lemma = lemma;
					var time = Math.round(Math.random() * 500);
					window.setTimeout(function() {
						return cb(null, result);
					}, time);
				});
			}, cb);
		},
		function (results, cb) {
			for (var i in results) {
				var result = results[i];
				if (result.entries.length === 0) {
					console.log("Lemma '" + result.lemma + "' wasn't found");
				} else {
					console.log(result.word + ": " + result.definition);
				}
			}
			db.close();
			cb();
		},
	], cb);
}

function lookupLemma(lemma, cb) {
	if (cb === undefined) {
		cb = cbLogger;
	}
	var db;
	async.waterfall([
		openDefaultDatabase,
		function(_db, cb) {
			db = _db;
			cardsWithLemma(lemma, db, cb);
		},
		function(result, cb) {
			db.close();
			return cb(null, result);
		},
	], cb);
}

function searchCards(search, cb) {
	if (cb === undefined) {
		cb = cbLogger;
	}
	var db;
	async.waterfall([
		openDefaultDatabase,
		function(_db, cb) {
			db = _db;
			cardsMatching(new RegExp(search, "i"), db, cb);
		},
		function(result, cb) {
			db.close();
			return cb(null, result);
		},
	], cb);
}

function testDatabase(lemmaSearch) {
	if (!lemmaSearch) {
		lemmaSearch = "el";
	}
	var testCards = [
		{
			set: "set1",
			word: "el arbol",
			lemmas: ["el", "arbol", "el"],
		},
		{
			set: "set1",
			word: "los padres",
			lemmas: ["el", "padre"],
		},
	];
	var testDBName = "testDatabase";
	var db;
	async.waterfall([
		function(cb) { openDatabase(testDBName, 1, cb) },
		function(_db, cb) {
			db = _db;
			var t = db.transaction([osCards], "readwrite");
			attachTransaction(t, cb);

			var cards = t.objectStore(osCards);
			for (var i in testCards) {
				cards.add(testCards[i]);
			}
		},
		function(cb) {
			cardsWithLemma(lemmaSearch, db, cb);
		},
		function(result, cb) {
			console.log(result);
			console.log(JSON.stringify(result));
			db.close();
			attachRequest(indexedDB.deleteDatabase(testDBName), cb);
		},
	], function(err) {
		if (err) {
			console.error(err);
			return;
		}
		console.log("Test database complete");
	});
}
