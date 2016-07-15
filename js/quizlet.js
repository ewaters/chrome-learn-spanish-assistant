// quizletAddToPreferredSet calls quizletAddToSet with the set name from the
// setting 'quizletSet'.
function quizletAddToPreferredSet(data, cb) {
	async.waterfall([
		function(cb) {
			keyFromSync("quizletSet", cb);
		},
		function(set, cb) {
			data.set = set;
			quizletAddToSet(data, cb);
		},
	], cb);
}

// quizletAddToSet takes an object like
// {
//   set: "/12345/set_name/",
//   word: "spanish word",
//   definition: "english word",
// }
// and will add the word and definition to the end of the given set.
function quizletAddToSet(data, cb) {
	// TODO: Normalize this.
	data.url = data.set;
	async.waterfall([
		// TODO: Strictly speaking, we can skip this step if we want to place
		// added terms at the top of the set rather than the bottom. This is
		// used only to set the rank (position) of the new term.
		function(cb) {
			quizletSetTerms(data, cb);
		},
		function(data, cb) {
			data.rank = data.terms.length;
			quizletPostTerm(data, cb)
		},
	], cb);
}

// quizletPostTerm is a helper for quizletAddToSet.
function quizletPostTerm(data, cb) {
	if (data.setId === undefined) {
		if (data.url === undefined) {
			console.error(data);
			return cb("quizletSetTerms called without url");
		}
		var match = data.url.match("^\/(\\d+)\/");
		if (match === null) {
			return cb("Set name '"+data.url+"' doesn't start with an ID");
		}
		data.setId = parseInt(match[1]);
	}

	var payload = {
		requestId: Date.now() + ":term:op-seq-0|op-seq-1|op-seq-2",
		data: [{
			setId: data.setId,
			definition: data.definition,
			word: data.word,
			rank: data.rank,
		}],
	};
	var options = {
		url: "https://quizlet.com/webapi/3.1/terms",
		type: "POST",
		data: JSON.stringify(payload),
		contentType: "application/json",
	};
	quizletAjax(options, cb);
}

/*
data = {
  setId: ...,
  terms: [{
    defintion: ...,
	word: ...,
  }, ...],
}
*/
function quizletPostTerms(postData, cb) {
	async.waterfall([
		function (cb) {
			var data = {
				setId: postData.setId,
			};
			quizletSetTerms(data, cb);
		},
		function(data, cb) {
			var rank = data.terms.length;
			var payload = {
				requestId: Date.now() + ":term:op-seq-0|op-seq-1|op-seq-2",
				data: [],
			};
			for (var i in postData.terms) {
				var term = postData.terms[i];
				term.rank = rank++;
				term.setId = postData.setId;
				payload.data.push(term);
			}
			var options = {
				url: "https://quizlet.com/webapi/3.1/terms",
				type: "POST",
				data: JSON.stringify(payload),
				contentType: "application/json",
			};
			quizletAjax(options, cb);
		},
	], cb);
}

// quizletAjax is a generic AJAX helper for making a request to Quizlet, using
// the XSS token found in the cookie.
function quizletAjax(options, cb) {
	async.waterfall([
		function(cb) {
			// Find the cross-site token.
			chrome.cookies.get({
				url: "https://quizlet.com",
				// This could change; it's found in Quizlet.cstokenName.
				name: "qtkn",
			}, function(cookie) {
				if (cookie === null) {
					return cb("Cookie not found");
				}
				return cb(null, cookie.value);
			});
		},
		function(csToken, cb) {
			options.headers = {
				"cs-token": csToken,
			};
			$.ajax(options)
				.done(function() { cb(null) })
				.fail(function(jq, textStatus) { cb(textStatus) });
		},
	], cb);
}

// wordMatchesTerm is a helper for quizletWordInFolder.
function wordMatchesTerm(word, term) {
	// var termParts = term.word.toLowerCase().split(" ");
	return term.word.toLowerCase().match("\\b" + word + "\\b") !== null;
}

// quizletWordInFolder is given a term to search all folders. If it's found,
// the return (via cb) will be {
//   folder: <folder spec>
//   term: <term spec>
// }
function quizletWordInFolder(word, cb) {
	word = word.toLowerCase();
	async.waterfall([
		function(cb) {
			keyFromLocal("quizletSets", cb);
		},
		function(data, cb) {
			for (var i in data.folders) {
				var folder = data.folders[i];
				for (var j in folder.terms) {
					if (wordMatchesTerm(word, folder.terms[j])) {
						return cb(null, {
							folder: folder,
							term:   folder.terms[j],
						});
					}
				}
			}
			return cb(null, null);
		},
	], cb);
}

// quizletUpdate updates all the state of the Quizlet folders and sets and
// caches the result, along with returning (via cb).
function quizletUpdate(cb) {
	var qzData;
	async.waterfall([
		function(cb) {
			keyFromSync("quizletId", cb);
		},
		function(id, cb) {
			quizletHome({ id: id }, cb);
		},
		function(data, cb) {
			console.log(data);
			qzData = data;
			async.mapLimit(data.folders, 2, quizletFolderInfo, cb);
		},
		function(folders, cb) {
			console.log(folders);
			qzData.folders = folders;
			async.mapLimit(qzData.sets, 2, quizletSetTerms, cb);
		},
		function(sets, cb) {
			console.log(sets);
			qzData.sets = sets;
			keyToLocal("quizletSets", qzData, cb);
		},
	], cb);
}

// quizletHome is passed the Quizlet user ID via { id: <num> }
//
// Returns (via cb) {
//   sets: [
//     {
//       title: ...
//       url: ...
//       termCount: <num>
//     }
//   ]
//   folders: [
//     {
//       title: ...
//       url: ...
//     }
//   ]
// }
function quizletHome(options, cb) {
	if (!options.id) {
		return cb("Quizlet id is missing");
	}
	options.url = "https://quizlet.com/" + options.id;
	fetchURL(options, function(err, content) {
		if (err) { return cb(err); }

		var data = {
			sets: [],
			folders: [],
		};
		var html = $(content);

		// Find all the sets.
		html.find(".set-preview").each(function(idx, node) {
			var article = $(node);
			var set = {
				title: article.find('.title-text').text(),
				url:   article.find("a").attr("href"),
				termCount: parseInt(article.find('small').text().split(" ")[0]),
			};
			data.sets.push(set);
		});

		// Find all the folders.
		html.find(".folders.section li").each(function(idx, node) {
			var li = $(node);
			if (li.hasClass("new")) {
				return;
			}
			var folder = {
				title: li.find(".label").text(),
				url:   li.find("a").attr("href"),
			};
			data.folders.push(folder);
		});
		cb(null, data);
	});
}

// quizletFolderInfo gets the list of sets and terms for the folder.
//
// Pass object with { url: <folder url> }
// Returns (via cb) object mixed in { 
//   sets: [
//     {
//       title: ...
//       url: ...
//       termCount: <num>
//     }
//   ]
//   terms: [
//     <term spec>
//   ]
// }
function quizletFolderInfo(data, cb) {
	async.waterfall([
		function (cb) {
			quizletFolderSets(data, cb);
		},
		quizletFolderTerms,
	], cb);
}

// quizletFolderSets is a helper for quizletFolderInfo.
function quizletFolderSets(data, cb) {
	fetchURL({
		url: "https://quizlet.com" + data.url + "/sets",
		cache: false,
	}, function(err, content) {
		if (err) { return cb(err); }
		data.sets = [];
		var html = $(content);
		html.find(".set-preview").each(function(idx, node) {
			var article = $(node);
			var set = {
				title: article.find('.title-text').text(),
				url:   article.find("a").attr("href"),
				termCount: parseInt(article.find('small').text().split(" ")[0]),
			};
			data.sets.push(set);
		});
		cb(null, data);
	});
}

function quizletFolderTerms(data, cb) {
	quizletFlashcardTerms({
		url: data.url + "/flashcards",
		cache: false,
	}, function(err, terms) {
		if (err) { return cb(err); }
		data.terms = terms;
		cb(null, data);
	});
}

function quizletSetIdFromURL(url) {
	if (url === undefined) {
		console.error("quizletSetIdFromURL passed undefined argument");
		return;
	}
	var match = url.match("^\/(\\d+)\/");
	if (match === null) {
		console.error("Set name '"+url+"' doesn't start with an ID");
		return;
	}
	return parseInt(match[1]);
}

function quizletSetTerms(data, cb) {
	if (data.setId === undefined) {
		if (data.url === undefined) {
			console.error(data);
			return cb("quizletSetTerms called without url");
		}
		var match = data.url.match("^\/(\\d+)\/");
		if (match === null) {
			return cb("Set name '"+data.url+"' doesn't start with an ID");
		}
		data.setId = parseInt(match[1]);
	}

	quizletFlashcardTerms({
		url: "/" + data.setId + "/flashcards",
		cache: false,
	}, function(err, terms) {
		if (err) { return cb(err); }
		data.terms = terms;
		cb(null, data);
	});
}

// quizletFlashcardTerms takes a '/flashcards' URL on { url: ... } and returns
// (via cb) an array of term specs.
function quizletFlashcardTerms(options, cb) {
	if (options.url[0] === "/") {
		options.url = "https://quizlet.com" + options.url;
	}
	async.waterfall([
		function(cb) {
			fetchURL(options, cb);
		},
		function(content, cb) {
			var re = new RegExp("Cards.init\\((.+)\\);");
			var match = content.match(re);
			if (match === null) {
				return cb("Flashcards didn't match pattern");
			}
			var cards;
			try {
				cards = $.parseJSON(match[1]);
			} catch (e) {
				return cb("JSON parse failed: " + e);
			}
			async.mapLimit(cards.terms, 10, addLemmas, cb);
		},
	], cb);
}

function quizletWriteToDB(cb) {
	var db;
	async.waterfall([
		openDefaultDatabase,
		function(_db, cb) {
			db = _db;
			clearDatabase(db, cb);
		},
		function (cb) {
			keyFromLocal("quizletSets", cb);
		},
		function(qzData, cb) {
			var t = db.transaction([osSets, osCards], "readwrite");
			attachTransaction(t, cb);

			var cards = t.objectStore(osCards);
			var sets = t.objectStore(osSets);
			for (var i in qzData.sets) {
				var set = qzData.sets[i];
				var setID = "quizlet" + set.url;
				sets.add({
					id: setID,
					url: set.url,
					title: set.title,
				});

				for (var j in set.terms) {
					var term = set.terms[j];
					cards.add({
						set: set.url,
						// Copy fields from term.
						word:       term.word,
						definition: term.definition,
						lemmas:     term.lemmas,
						tags:       term.tags,
					});
				}
			}
		},
		function(cb) {
			db.close();
			cb();
		},
	], cb);
}

function quizletRenderSetSelect(select, selectedURL, cb) {
	async.waterfall([
		function(cb) {
			keyFromLocal("quizletSets", cb);
		},
		function(sets, cb) {
			for (var i in sets.folders) {
				var folder = sets.folders[i];
				var optGroup = $("<optgroup/>");
				optGroup.attr("label", folder.title);
				select.append(optGroup);
				for (var j in folder.sets) {
					var set = folder.sets[j];
					var opt = $("<option/>");
					opt.attr("value", set.url);
					opt.append(set.title);
					if (selectedURL === set.url) {
						opt.attr("selected", true);
					}
					optGroup.append(opt);
				}
			}
			cb();
		},
	], cb);
}
