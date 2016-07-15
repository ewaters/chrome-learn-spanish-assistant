var msg = chrome.extension.getBackgroundPage().textSelectionMessage;
document.addEventListener('DOMContentLoaded', init);

var dt, clicked, lemmaData, inputCell = null;

// Which pieces of data (from unknownLemmas return objects) to show in the table.
var dtColumns = [
	{ data: "lemma", title: "Lemma" },
	{ data: "word", title: "Word" },
	{ data: "definition", title: "Definition" },
];

function init() {
	if (!msg || !msg.selection) {
		return render("msg.selection is not set");
	}
	async.waterfall([
		function(cb) {
			quizletRenderSetSelect($("#quizlet_set"), null, cb);
		},
		function(cb) {
			unknownLemmas(msg.selection, cb);
		},
	], render);
}

function render(err, data) {
	if (err) {
		$("#status").text("Failed: " + err);
		return;
	}
	$("#status").hide();

	lemmaData = data;

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
	// If the shift is held down, continue with editing the cell.
	if (!evt.shiftKey) {
		return;
	}

	// Save this for debugging.
	clicked = this;

	// Ignore additional clicks if the cell is already in edit mode.
	var cell = dt.cell(this).index();
	if (inputCell !== null) {
		if (inputCell.row === cell.row && inputCell.column === cell.column) {
			// Clicked in the same cell again, maybe in the text
			// input. Ignore this.
			return;
		}
	}
	inputCell = cell;

	// Replace value of clicked column with an input box.
	var key = dtColumns[cell.column].data;
	var contents = dt.data()[ cell.row ][ key ];
	var escaped = contents.replace('"', '\\"').replace("'", "\\'");
	dt.data()[ cell.row ][ key ] = "<input type='text' value='" + escaped + "'/>";
	dt.rows().invalidate().draw();

	// Make this input box save and clear itself upon blur.
	$(this).find("input").on("blur", function() {
		dt.data()[ cell.row ][ key ] = $(this).val();
		dt.rows().invalidate().draw();
	});

	// Focus the input box.
	$(this).find("input").focus();
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
	var statusDiv = $("#status");
	statusDiv.show();
	statusDiv.text("Processing...");
	$("#content").hide();
	submitTerms(function(err) {
		if (err) {
			statusDiv.text(err);
			return;
		}
		statusDiv.text("Success!");
	});
}

function submitTerms(cb) {
	async.waterfall([
		function(cb) {
			var setURL = $("#quizlet_set").val();
			var store = {
				setId: quizletSetIdFromURL(setURL),
				terms: [],
			};
			if (store.setId === undefined) {
				return cb("Invalid set selected");
			}
			retrieve(false).forEach(function(val) {
				store.terms.push({
					word: val.word,
					definition: val.definition,
				});
			});
			if (store.terms.length === 0) {
				return cb();
			}
			console.log("Storing "+store.terms.length+" terms to Quizlet "+setURL);
			quizletPostTerms(store, cb);
		},
		function(cb) {
			var known = [];
			retrieve(true).forEach(function(val) {
				known.push({
					lemma: val.lemma,
					word: val.word,
					definition: val.definition,
				});
			});
			if (known.length === 0) {
				return cb();
			}
			console.log("Storing "+known.length+" known terms");
			storeKnownWords(known, cb);
		},
	], cb);
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
