var msg = chrome.extension.getBackgroundPage().wordSelectionMessage;
document.addEventListener('DOMContentLoaded', init);

function init() {
	$("#context .before").text(msg.sentenceBefore);
	$("#context .selection").text(msg.selection);
	$("#context .after").text(msg.sentenceAfter);

	var data = {};
	async.waterfall([
		function(cb) {
			sdictDefineWord(msg.selection, cb);
		},
		function(result, cb) {
			data.sdict = result;
			keyFromSync("quizletSet", cb);
		},
		function (set, cb) {
			data.quizletSet = set;
			keyFromLocal("quizletSets", cb);
		},
		function (sets, cb) {
			data.quizletSets = sets;
			quizletWordInFolder(msg.selection, cb);
		},
		function (folder, cb) {
			if (folder !== null) {
				data.inFolder = folder;
			}
			cb(null, data);
		},
	], render);
}

function render(err, data) {
	if (err) {
		$("#status").text("Failed: " + err);
		return;
	}

	$("#status").remove();

	$("#meanings").html(Mustache.to_html(
		$("#meaningTmpl").text(),
		{
			result: data.sdict,
			meanings: sdictCollapseTranslations(data.sdict),
		}
	));

	if (data.inFolder) {
	} else {
		$("#quizlet").html(Mustache.to_html(
			$("#quizletAddTmpl").text(),
			{
				word: data.sdict.word,
				definition: data.sdict.definition,
				quizletSets: data.quizletSets,
				quizletSet: data.quizletSet,
				selected: function() {
					return function(text, render) {
						text = render(text);
						if (text === data.quizletSet) {
							return " selected";
						}
						return "";
					}
				},
			}
		));
		$("#quizletAdd").on("click", function() {
			var add = {
				word: $("#quizletAddWord").val(),
				definition: $("#quizletAddDefinition").val(),
				set: $("#quizletSet option:selected").attr("value"),
			};
			console.log(add);
		});
	}

}
