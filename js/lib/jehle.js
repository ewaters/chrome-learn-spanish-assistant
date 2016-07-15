var jehleDB;

function initJehle() {
	$.ajax({
		dataType: "json",
		url: chrome.extension.getURL("data/jehle_verb_database.json"),
	})
	.done(function(data) {
		jehleDB = data;
	})
	.fail(function(jq, textStatus) {
		console.error(`Jehle database load failed: ${textStatus}`);
	});
}
initJehle();

function jehleExpandVerbMoods(inf, moods) {
	var data = jehleDB[inf];
	if (!data) {
		return;
	}
	var cards = [];
	moods.forEach(mood => {
		var tagset = moodToTagset[mood];
		if (!tagset) {
			console.error(`No tagset for Jehle mood ${mood}`);
			return;
		}
		var parts = mood.split(".", 2);
		if (parts.length === 1) {
			// Gerund, Infinitive, Participle.
			let pair = data[parts[0]];
			if (pair.length !== 2) {
				console.error(`Invalid Jehle data for ${inf} mood ${mood} not 2 length`);
				console.log(data);
				return;
			}
			cards.push({
				mood: mood,
				lemma: inf,
				tag: `${tagset}00`,
				spanish: pair[0],
				english: pair[1],
			});
			return;
		}

		var item = data.Conjugations[parts[0]][parts[1]];
		if (!item) {
			console.error(`Invalid Jehle data for ${inf} mood ${mood} no conjugated`);
			console.log(data);
			return;
		}
		var desc = item.Desc;
		item.Forms.forEach((conjugated, idx) => {
			if (conjugated === "") {
				return;
			}
			var plural = idx > 2 ? "P" : "S";
			var person = (idx % 3) + 1;
			cards.push({
				mood: mood,
				lemma: inf,
				tag: `${tagset}${person}${plural}`,
				spanish: conjugated,
				english: translateDesc(desc, `${person}${plural}`),
			});
		});
	});

	cards.forEach(c => {
		var reg = regularConjugation(c.lemma, c.tag);
		c.isRegular = reg == c.spanish;
		c.regular = reg;
	});
	return cards;
}

function regularConjugation(inf, tag, isReflexive) {
	var person = tag.substr(2, 2);
	if (isReflexive === undefined) {
		let match = inf.match(/^(.+)se$/);
		if (match !== null) {
			let base = regularConjugation(match[1], tag, true);
			let pronoun = tagsetToReflexivePronoun[person];
			if (pronoun === undefined) {
				return base;
			}
			return `${pronoun} ${base}`;
		}
	}

	var match = inf.match(/^(.+?)(.r)$/);
	if (match === null) {
		console.log(`Cannot determine conjugation of ${inf}`);
		return;
	}
	var [ , root, base ] = match;
	switch (tag.substr(0, 2)) {
	case "N0":
		return isReflexive ? `${inf}se` : inf;
	case "G0":
		switch (base) {
		case "ar":
			return isReflexive ? `${root}ándose` : `${root}ando`;
		case "er":
		case "ir":
			return isReflexive ? `${root}iéndose` : `${root}iendo`;
		}
	case "P0":
		switch (base) {
		case "ar":
			return `${root}ado`;
		case "er":
		case "ir":
			return `${root}ido`;
		}
	case "IP":
		switch (base) {
		case "ar":
			switch (person) {
			case "1S": return `${root}o`;
			case "2S": return `${root}as`;
			case "3S": return `${root}a`;
			case "1P": return `${root}amos`;
			case "2P": return `${root}áis`;
			case "3P": return `${root}an`;
			}
		case "er":
			switch (person) {
			case "1S": return `${root}o`;
			case "2S": return `${root}es`;
			case "3S": return `${root}e`;
			case "1P": return `${root}emos`;
			case "2P": return `${root}éis`;
			case "3P": return `${root}en`;
			}
		case "ir":
			switch (person) {
			case "1S": return `${root}o`;
			case "2S": return `${root}es`;
			case "3S": return `${root}e`;
			case "1P": return `${root}imos`;
			case "2P": return `${root}ís`;
			case "3P": return `${root}en`;
			}
		}
	case "IS": // Preterite
		switch (base) {
		case "ar":
			switch (person) {
			case "1S": return `${root}é`;
			case "2S": return `${root}aste`;
			case "3S": return `${root}ó`;
			case "1P": return `${root}amos`;
			case "2P": return `${root}asteis`;
			case "3P": return `${root}aron`;
			}
		case "er":
		case "ir":
			switch (person) {
			case "1S": return `${root}í`;
			case "2S": return `${root}iste`;
			case "3S": return `${root}ió`;
			case "1P": return `${root}imos`;
			case "2P": return `${root}isteis`;
			case "3P": return `${root}ieron`;
			}
		}
	case "II": // Imperfect
		switch (base) {
		case "ar":
			switch (person) {
			case "1S": return `${root}aba`;
			case "2S": return `${root}abas`;
			case "3S": return `${root}aba`;
			case "1P": return `${root}ábamos`;
			case "2P": return `${root}abais`;
			case "3P": return `${root}aban`;
			}
		case "er":
		case "ir":
			switch (person) {
			case "1S": return `${root}ía`;
			case "2S": return `${root}ías`;
			case "3S": return `${root}ía`;
			case "1P": return `${root}íamos`;
			case "2P": return `${root}íais`;
			case "3P": return `${root}ían`;
			}
		}
	}
}

function translateDesc(desc, who) {
	var match = desc.match(/^I (.+)$/);
	if (match === null) {
		console.error("Can't match " + desc);
		return `${tagsetToPronoun[who]}: ${desc}`;
	}
	return `(${tagsetToPronoun[who]}) ${match[1]}`;
	/*
	var match = desc.match(/^I (\w+)(.*), am (\w+)(.*)$/);
	if (match === null) {
		console.error("Can't match " + desc);
		return `${tagsetToPronoun[who]}: ${desc}`;
	}
	switch (who) {
		case "1S":
			return desc;
		case "2S":
			return `You ${match[1]}${match[2]}, are ${match[3]}${match[4]}`;
	}
	return desc;
	*/
}

function testJehle(vb) {
	console.log(JSON.stringify(jehleExpandVerbMoods(vb,
		[
			"Indicative.Present",   // I load        - cargo
			"Indicative.Preterite", // I loaded      - cargué
			"Indicative.Imperfect", // I was loading - cargaba
			"Infinitive",           // To load       - cargar
			"Gerund",               // Loading       - cargando
			"Participle",           // Loaded        - cargado
		]
	)));
}
