var msg = chrome.extension.getBackgroundPage().textSelectionMessage;
document.addEventListener('DOMContentLoaded', init);

function init() {
	return unknownLemmas(msg.selection, render);
}

function render(err, data) {
	if (err) {
		$("#status").text("Failed: " + err);
		return;
	}
	$("#status").remove();

	var dataSet = [];
	for (var i in data) {
		var item = data[i];
		dataSet.push([
			item.lemma,
			item.word,
			item.definition,
		]);
	}
	$('#table').DataTable({
		data: dataSet,
		columns: [
			{ title: "Lemma" },
			{ title: "Word" },
			{ title: "Definition" },
		],
		initComplete: function () {
			var api = this.api();
			api.$('td').click(function () {
				api.search(this.innerHTML).draw();
			});
		},
	});
	$('#table tbody').on('click', 'tr', function () {
		var elem = $(this);
		if (elem.hasClass('selected')) {
			elem.removeClass('selected');
		}
		else {
			elem.addClass('selected');
		}
	});

}
