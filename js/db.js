const dbName = "flashcards",
	dbVersion = 2,
	osSets = "sets",
	osCards = "cards",
	idxLemmas = "lemmas",
	osKnown = "known";

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

var overrideDefaultDatabase;

function openDefaultDatabase(cb) {
	if (overrideDefaultDatabase !== undefined) {
		return openDatabase(overrideDefaultDatabase.name, overrideDefaultDatabase.version, cb);
	}
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
		if (evt.oldVersion < 2) {
			var known = db.createObjectStore(osKnown, { autoIncrement: true });
			known.createIndex(idxLemmas, "lemma", { unique: true });
		}
		// onsuccess will follow.
	};
	req.onsuccess = function() {
		cb(null, req.result);
	};
}

function clearDatabase(db, cb) {
	var t = db.transaction([osSets, osCards], "readwrite");
	attachTransaction(t, cb);

	t.objectStore(osSets).clear();
	t.objectStore(osCards).clear();
}

function doWithDb(f, cb) {
	if (cb === undefined) {
		cb = cbLogger;
	}
	var db;
	async.waterfall([
		openDefaultDatabase,
		function(_db, cb) {
			db = _db;
			f(db, cb);
		},
		function(result, cb) {
			if (cb === undefined) {
				cb = result;
				result = undefined;
			}
			db.close();
			if (result === undefined) {
				return cb(null);
			} else {
				return cb(null, result);
			}
		},
	], cb);
}

function doWithTransaction(stores, mode, f, cb) {
	doWithDb(function(db, cb) {
		var t = db.transaction(stores, mode);
		attachTransaction(t, cb);
		f(t, cb);
	}, cb);
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
	var knownLemmas = {};
	var db;
	async.waterfall([
		getKnownWords,
		function(items, cb) {
			items.forEach(function(item) {
				knownLemmas[item.lemma] = true;
			});
			cb();
		},
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
			var unknown = [];
			for (var i in records) {
				var record = records[i];
				if (record.cards.length > 0) {
					continue;
				}
				if (knownLemmas[record.lemma]) {
					continue;
				}
				unknown.push(record);
			}

			async.mapSeries(unknown, function(record, cb) {
				record.lookup = record.lemma.replace(/_/g, " ");
				sdictDefineWord(record.lookup, function(err, result) {
					if (err) {
						return cb(err);
					}
					for (var key in record) {
						result[key] = record[key];
					}
					return cb(null, result);
				});
			}, cb);
		},
		function (results, cb) {
			var found = [];
			for (var i in results) {
				var result = results[i];
				var lc = result.word.toLowerCase();
				if (result.entries.length === 0) {
					console.log("Lemma '" + result.lemma + "' wasn't found");
				} else if (result.definition === undefined || result.definition.length === 0) {
					console.log("Lemma '" + result.lemma + "' found word '" + result.word + "' but no definition");
				} else if (lc !== "el " + result.lookup && lc !== "la " + result.lookup && lc !== result.lookup) {
					console.log("Lemma '" + result.lemma + "' (" + result.tokens[0].tag + ") != '" + result.word + "': '" + result.definition + "'");
				}
				found.push(result);
			}
			db.close();
			cb(null, found);
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

function storeKnownWords(data, cb) {
	doWithTransaction([osKnown], "readwrite", function(t) {
		var known = t.objectStore(osKnown);
		for (var i in data) {
			known.add(data[i]);
		}
	}, cb);
}

function getKnownWords(cb) {
	doWithTransaction([osKnown], "readonly", function(t, cb) {
		var result = [];
		t.oncomplete = function() { cb(null, result) };
		t.objectStore(osKnown).openCursor().onsuccess = function(evt) {
			var cursor = evt.target.result;
			if (!cursor) {
				return;
			}
			result.push(cursor.value);
			cursor.continue();
		};
	}, cb);
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
	var knownWords = [
		{
			lemma: "señor",
			word: "El señor",
			defintion: "Man, sir",
		},
	];

	var testDBName = "testDatabase";
	overrideDefaultDatabase = {
		name: testDBName,
		version: 2,
	};

	var db;
	async.waterfall([
		openDefaultDatabase,
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
			// TODO: Add an assert here.
			console.log(result);
			console.log(JSON.stringify(result));
			db.close();
			storeKnownWords(knownWords, cb);
		},
		function(cb) {
			console.log("Known words stored. Now retrieving");
			getKnownWords(cb);
		},
		function(result, cb) {
			var got = JSON.stringify(result),
				want = JSON.stringify(knownWords);
			if (got !== want) {
				console.error("Known words mismatch");
				console.log({ got: result, want: knownWords });
			} else {
				console.log("Known words match.");
			}
			cb();
		},
		function(cb) {
			attachRequest(indexedDB.deleteDatabase(testDBName), cb);
		},
	], function(err) {
		overrideDefaultDatabase = undefined;
		if (err) {
			console.error(err);
			return;
		}
		console.log("Test database complete");
	});
}
