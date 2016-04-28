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

/*
 * Call with data like:
 * {
 *   set: "/12345/set_name/",
 *   word: "spanish word",
 *   definition: "english word",
 * }
 * */
function quizletAddToSet(data, cb) {
	var match = data.set.match("^\/(\\d+)\/");
	if (match === null) {
		return cb("Set name '"+data.set+"' doesn't start with an ID");
	}
	data.setId = parseInt(match[1]);

	async.waterfall([
		// TODO: Strictly speaking, we can skip this step if we want to place
		// added terms at the top of the set rather than the bottom. This is
		// used only to set the rank (position) of the new term.
		function(cb) {
			quizletSetTerms(data, cb);
		},
		function(data, cb) {
			data.rank = data.terms.length;
			quizletPostTerms(data, cb)
		},
	], cb);
}

function quizletPostTerms(data, cb) {
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
				.fail(function(jq, textStatus, errorThrown) { cb(textStatus) });
		},
	], cb);
}

function wordMatchesTerm(word, term) {
	// var termParts = term.word.toLowerCase().split(" ");
	return term.word.toLowerCase().match("\\b" + word + "\\b") !== null;
}

function quizletWordInFolder(word, cb) {
	word = word.toLowerCase();
	async.waterfall([
		function(cb) {
			keyFromLocal("quizletSets", cb);
		},
		function(data, cb) {
			for (i in data.folders) {
				folder = data.folders[i];
				for (j in folder.terms) {
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

function quizletUpdate(cb) {
	var qzData;
	async.waterfall([
		function(cb) {
			keyFromSync("quizletId", cb);
		},
		quizletHome,
		function(data, cb) {
			qzData = data;
			async.map(data.folders, quizletFolderInfo, cb);
		},
		function(folders, cb) {
			qzData.folders = folders;
			keyToLocal("quizletSets", qzData, cb);
		},
	], cb);
}

function quizletHome(quizletId, cb) {
	if (!quizletId) {
		return cb("Quizlet id is missing");
	}
	fetchURL({
		url: "https://quizlet.com/" + quizletId,
	}, function(err, content) {
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
				terms: parseInt(article.find('small').text().split(" ")[0]),
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

function quizletFolderInfo(data, cb) {
	async.waterfall([
		function (cb) {
			quizletFolderSets(data, cb);
		},
		quizletFolderTerms,
	], cb);
}

function quizletFolderTerms(data, cb) {
	quizletFlashcardTerms({
		url: data.url + "/flashcards",
	}, function(err, terms) {
		if (err) { return cb(err); }
		data.terms = terms;
		cb(null, data);
	});
}

function quizletSetTerms(data, cb) {
	quizletFlashcardTerms({
		url: "/" + data.setId + "/flashcards",
		cache: false,
	}, function(err, terms) {
		if (err) { return cb(err); }
		data.terms = terms;
		cb(null, data);
	});
}

function quizletFolderSets(data, cb) {
	fetchURL({
		url: "https://quizlet.com" + data.url + "/sets",
	}, function(err, content) {
		if (err) { return cb(err); }
		data.sets = [];
		var html = $(content);
		html.find(".set-preview").each(function(idx, node) {
			var article = $(node);
			var set = {
				title: article.find('.title-text').text(),
				url:   article.find("a").attr("href"),
				terms: parseInt(article.find('small').text().split(" ")[0]),
			};
			data.sets.push(set);
		});
		cb(null, data);
	});
}

function quizletFlashcardTerms(options, cb) {
	if (options.url[0] === "/") {
		options.url = "https://quizlet.com" + options.url;
	}
	fetchURL(options, function(err, content) {
		if (err) { return cb(err); }
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
		cb(null, cards.terms);
	});
}
