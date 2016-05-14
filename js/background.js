var wordSelectionID = null,
	wordSelectionMessage,
	sdictPageID = "ctxMenuSDictPage";

// Set up context menu tree at install time.
chrome.runtime.onInstalled.addListener(function() {
	// If the page is a spanishdict.com page, offer to add the word to
	// quizlet.com.
	chrome.contextMenus.create({
		title: "Add <word> to Quizlet",
		contexts: ["page"],
		id: sdictPageID,
		documentUrlPatterns: [
			"http://www.spanishdict.com/translate/*",
			"http://www.spanishdict.com/conjugate/*",
			"http://www.spanishdict.com/examples/*",
		],
	});

	chrome.alarms.clearAll();
	/*
	chrome.alarms.create("updateQuizletSets", {
		periodInMinutes: 1,
	});
	*/
	alarmUpdateQuizletSets();

});

function sdict(word) {
	sdictDefineWord(word, function(err, result) {
		if (err) {
			console.error("Failed: " + err);
		} else {
			console.log(result);
		}
	});
}

// Set up an event on when a context menu is clicked.
chrome.contextMenus.onClicked.addListener(function(info, tab) {
	console.log("item " + info.menuItemId + " was clicked");
	console.log("info: " + JSON.stringify(info));
	console.log("tab: " + JSON.stringify(tab));
	if (info.menuItemId === wordSelectionID) {
		wordSelectionClicked(wordSelectionMessage, info);
		return;
	}
});

// Listen for any firing alarms.
chrome.alarms.onAlarm.addListener(function(alarm) {
	if (alarm.name === "updateQuizletSets") {
		alarmUpdateQuizletSets();
	} else {
		console.log("Unhandled alarm " + alarm);
	}
});

function alarmUpdateQuizletSets() {
	quizletUpdate(function(err) {
		if (err) {
			console.log("quizletUpdate failed:");
			console.log(err);
		}
	});
}

// Listen for messages from the content script.
chrome.runtime.onMessage.addListener(function(msg) {
	// Unused args: sender, sendResponse
    if (msg.request !== 'updateContextMenu') {
		return;
	}

	if (msg.selection === "") {
		if (wordSelectionID !== null) {
			chrome.contextMenus.remove(wordSelectionID);
			wordSelectionID = null;
		}
		return;
	}

	msg = getSentence(msg);
	console.log(msg);

	// TODO: Lookup the selected word but also look at the context (the
	// surrounding text). If the sdict alternate phrase exists in the
	// context, that's what we want to define.
	// 
	// For example, if the context is "Sin embargo, hay ..." and the selected
	// text is "embargo", the translation has an alternate of "sin embargo"
	// which is actually what we're defining, not the word "embargo" by itself.
	//
	// Also, know how to recognize indirect object pronouns on the end. For
	// example, "asegúrate" should lookup "asegúra", "mostrarles" = "mostrar"

	// If a word is highlighted, offer to either look up this word in
	// spanishdict.com, or add it to a quizlet.com set.
	var options = {
		title: "Lookup or remember '" + msg.selection + "'",
		contexts: ["selection"],
	};
	wordSelectionMessage = msg;
	if (wordSelectionID !== null) {
		chrome.contextMenus.update(wordSelectionID, options);
	} else {
		options.id = "ctxMenuWordSelectionID";
		wordSelectionID = chrome.contextMenus.create(options);
	}
});

var sentenceSepRE = new RegExp(/(\.\s|\.+|,\s|:\s|;\s|\s\(|\)|¡|!|\?|¿|\/)/),
	sepMatchRE    = new RegExp("^" + sentenceSepRE.source + "$");

function getSentence(msg) {
	if (msg.before === undefined || msg.after === undefined) {
		return msg;
	}
	var before = msg.before.split(sentenceSepRE),
		after  = msg.after.split(sentenceSepRE);

	if (before.length > 0 && !sepMatchRE.test(before[before.length-1])) {
		msg.sentenceBefore = before[before.length-1];
	}
	if (after.length > 0 && !sepMatchRE.test(after[0])) {
		msg.sentenceAfter = after[0];
	}
	return msg;
}

function wordSelectionClicked(msg) {
	// Unused arg: info
	var options = {
		url: "wordSelection.html",
		width: 500,
		height: 300,
		type: "popup",
	};
	if (msg.windowOffset && msg.selectionRect) {
		// Position the top left of the new window on the top left of the
		// selected text.
		options.left = msg.selectionRect.left + msg.windowOffset.x;
		options.top = msg.selectionRect.top + msg.windowOffset.y + (msg.windowOffset.outerH - msg.windowOffset.innerH);
	}
	chrome.windows.create(options);
}
