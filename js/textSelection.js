var msg = chrome.extension.getBackgroundPage().textSelectionMessage;
document.addEventListener('DOMContentLoaded', init);

var dt, dtColumns, clicked, lemmaData, inputCell = null;

function init() {
	if (!msg || !msg.selection) {
		return render("msg.selection is not set");
	}
	return unknownLemmas(msg.selection, render);
}

function render(err, data) {
	if (err) {
		$("#status").text("Failed: " + err);
		return;
	}
	$("#status").remove();

	lemmaData = data;
	dtColumns = [
		{ data: "lemma", title: "Lemma" },
		{ data: "word", title: "Word" },
		{ data: "definition", title: "Definition" },
	];

	dt = $('#table').DataTable({
		data: data,
		columns: dtColumns,
		initComplete: function () {
			var api = this.api();
			api.$('td').click(cellClicked);
		},
	});
	$('#table tbody').on('click', 'tr', rowClicked);
	$('#button').on('click', buttonClicked);
}

function cellClicked (evt) {
	if (!evt.shiftKey) {
		return;
	}
	console.log(evt);
	clicked = this;
	var cell = dt.cell(this).index();

	if (inputCell !== null) {
		if (inputCell.row === cell.row && inputCell.column === cell.column) {
			// Clicked in the same cell again, maybe in the text
			// input. Ignore this.
			return;
		}
	}
	console.log("Clicked " + this.innerHTML + " index " + cell.row);
	var key = dtColumns[cell.column].data;

	var contents = dt.data()[ cell.row ][ key ];
	var escaped = contents.replace('"', '\\"').replace("'", "\\'");
	dt.data()[ cell.row ][ key ] = "<input type='text' value='" + escaped + "'/>";
	//dt.data()[ cell.row ][0] += ".";
	dt.rows().invalidate().draw();

	$(this).find("input").on("blur", function() {
		dt.data()[ cell.row ][ key ] = $(this).val();
		dt.rows().invalidate().draw();
	});

	$(this).find("input").focus();
	inputCell = cell;
}

const omitClass = 'omit';

function rowClicked() {
	var elem = $(this);
	if (elem.hasClass(omitClass)) {
		elem.removeClass(omitClass);
	}
	else {
		elem.addClass(omitClass);
	}
}

function buttonClicked() {
	console.log(retrieve(false));
	console.log(retrieve(true));
}

function retrieve(wantOmitted) {
	var omitted = dt.rows('.' + omitClass)[0];
	var omitIdx = {};
	for (var i in omitted) {
		omitIdx[omitted[i]] = true;
	}

	var ret = [];
	dt.data().each(function(row, i) {
		if ((wantOmitted && !omitIdx[i]) || (!wantOmitted && omitIdx[i])) {
			return;
		}
		ret.push(row);
	});
	return ret;
}
