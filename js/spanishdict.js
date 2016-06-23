function sdict(word) {
	sdictDefineWord(word, cbLogger);
}

function sdictDefineWord(word, cb) {
	word = word.toLowerCase();
	async.waterfall([
		function(cb) {
			fetchURL({
				url: "http://www.spanishdict.com/translate/" + word,
			}, cb);
		},
		function(content, cb) {
			sdictParseTranslate($(content), cb);
		},
		function(trans, cb) {
			var collapsed = sdictCollapseTranslations(trans);
			if (collapsed.length > 0) {
				var first = collapsed[0];
				// If there's no default definition, come up with one.
				// i.e. quebrantado
				if (trans.definition === "") {
					trans.definition = first.translation;
				}
				// If this is a noun, add the el/la.
				switch (first.partOfSpeech) {
					case "feminine noun":
						trans.word = "la " + trans.word;
						break;
					case "masculine noun":
						trans.word = "el " + trans.word;
						break;
				}
			}
			trans.word = sentenceCase(trans.word);
			trans.definition = sentenceCase(trans.definition);
			cb(null, trans);
		},
	], cb);
}

function sentenceCase(word) {
	if (word === undefined || word === "") {
		return "";
	}
	return word[0].toUpperCase() + word.slice(1);
}

function sdictCollapseTranslations(trans) {
	var result = [];
	var i, j, k, l, m, entry, item, group, meaning, translation;
	for (i in trans.entries) {
		entry = trans.entries[i];
		for (j in entry.items) {
			item = entry.items[j];
			for (k in item.groups) {
				group = item.groups[k];
				for (l in group.meanings) {
					meaning = group.meanings[l];
					for (m in meaning.translations) {
						translation = meaning.translations[m];
						result.push({
							title:        item.title,
							partOfSpeech: group.partOfSpeech,
							number:       meaning.number,
							letter:       translation.letter,
							context:      meaning.context,
							translation:  translation.translation,
							examples:     translation.examples,
							copyright:    entry.copyright,
						});
					}
				}
			}
		}
	}
	return result;
}

function sdictParseTranslate(html, cb) {
	var card = html.find(".translate .card:first");
	if (html.find(".tab-content").length === 1) {
		card = html.find("#translate-en .card");
	}
	var quickdef = card.find(".quickdef");
	var data = {
		word:       quickdef.find(".source-text").text(),
		definition: quickdef.find(".lang .el").text(),
	};

	var quicktip = card.find("a.translate-quicktip");
	if (quicktip.length === 1 && /Looking for the phrase/.test(quicktip.text())) {
		data.alternate = quicktip.find("span strong").text();
	}

	async.map(
		card.find(".dictionary-entry"),
		sdictParseDictEntry,
		function(err, parsed) {
			data.entries = parsed;
			cb(err, data)
		}
	);
}

/*
 * Parse a dictonary entry like so:
 * {
 *   copyright: "...",
 *   items: [{
 *     title: "acabar",
 *     groups: [{
 *       partOfSpeech: "intransitive verb",
 *       meanings: [{
 *         number: 1,
 *         context: "to come to an end",
 *         translations: [{
 *           letter: "a",
 *           translation: "to end",
 *           examples: [{
 *               defintion: "I'll call you after the movie ends.",
 *               phrase: "Te llamaré después de que acabe la película.",
 *           }],
 *         }],
 *       }],
 *     }],
 *   }],
 * }
 */
function sdictParseDictEntry(node, cb) {
	var entry = $(node);
	var classes = entry.attr("class").split(/\s+/);
	if (classes.length !== 2 || classes[0] !== "dictionary-entry") {
		return cb("Unexpected classes list: " + entry.attr("class"));
	}
	var baseClass = classes[1];
	var data = {
		items: [],
	};
	var activeItem, activeGroup;

	var err;
	entry.children().each(function(idx, node) {
		var child = $(node);

		// Handle the <a class='part_of_speech'>Verb</a>
		if (child.hasClass("part_of_speech")) {
			if (activeGroup !== undefined) {
				activeItem.groups.push(activeGroup);
			}
			activeGroup = {
				partOfSpeech: child.text().toLowerCase(),
				meanings: [],
			};
			return;
		}

		// Not what I'm looking for - could be a 'dictionary-untext'
		// and be an '<ol>' (see 'una vez que').
		if (child.attr("class") === undefined) {
			return false;
		}
		var classes = child.attr("class").split(/\s+/);
		if (classes.length !== 1) {
			console.error(child);
			err = "Entry child has unexpected classes " + child.attr("class");
			return false;
		}
		var cls = classes[0].replace(baseClass + "-", "");
		if (cls === "entry-title") {
			if (activeItem !== undefined) {
				if (activeGroup !== undefined) {
					activeItem.groups.push(activeGroup);
				}
				data.items.push(activeItem);
			}
			activeItem = {
				title: child.text(),
				groups: [],
			};
		} else if (cls === "indent-1") {
			var result = sdictParseMeaning(baseClass, child);
			if (result.err) {
				console.error(child);
				err = result.err;
				return false;
			}
			activeGroup.meanings.push(result);
		} else if (cls === "d-copyright") {
			data.copyright = child.text();
		}
	});
	if (activeItem !== undefined) {
		if (activeGroup !== undefined) {
			activeItem.groups.push(activeGroup);
		}
		data.items.push(activeItem);
	}
	return cb(err, data);
}

function sdictParseMeaning(baseClass, meaning) {
	var result = {
		context: meaning.find(".context").text().slice(1,-1),
		translations: [],
	};

	var match = meaning.find(".def").text().match(/^(\d+)/);
	if (match === null) {
		result.err = "Couldn't find def number";
		return result;
	}
	result.number = parseInt(match[1]);

	var activeTranslation;

	meaning.find("." + baseClass + "-indent-2").children().each(function(idx, node) {
		var elem = $(node);
		var classes = elem.attr("class").split(/\s+/);
		if (classes.length !== 1) {
			console.error(elem);
			result.err = "Indent-2 child has !== 1 classes"
			return false;
		}
		var cls = classes[0].replace(baseClass + "-", "");
		if (cls === "translation") {
			if (activeTranslation !== undefined) {
				result.translations.push(activeTranslation);
			}
			activeTranslation = {
				translation: elem.find("." + baseClass + "-translation-translation").text(),
				examples: [],
			};
			var match = elem.find("." + baseClass + "-translation-letters").text().match(/^(.)\./);
			if (match !== null) {
				activeTranslation.letter = match[1];
			}
		} else if (cls === "indent-3") {
			elem.find("." + baseClass + "-example").each(function(idx, node) {
				var elem = $(node);
				activeTranslation.examples.push({
					phrase: elem.find("span:first").text(),
					definition: elem.find(".exB").text(),
				});
			});
		} else {
			console.error(elem);
			result.err = "Unexpected child class " + cls;
			return false;
		}
	});
	if (activeTranslation !== undefined) {
		result.translations.push(activeTranslation);
	}

	return result;
}
