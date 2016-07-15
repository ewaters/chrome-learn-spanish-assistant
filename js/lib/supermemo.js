var sm2 = {
	defaultEF: 2.5,
	updateEF: function(ef, q) {
		if (!q || q < 0 || q > 5) {
			q = 0;
		}
		var newEF = ef+(0.1-(5-q)*(0.08+(5-q)*0.02));
		return newEF < 1.3 ? 1.3 : newEF;
	},
	nextInterval: function(lastInterval, ef, q) {
		if (q < 3) {
			return 1;
		}
		if (lastInterval == 0) {
			return 1;
		}
		if (lastInterval == 1) {
			return 6;
		}
		return lastInterval * ef;
	},
};

function testSM2() {
	for (let q = 0; q <= 5; q++) {
		let ef = sm2.defaultEF;
		let interval = 0;
		console.log(`Start with EF: ${ef} q: ${q}`);
		for (let n = 0; n < 10; n++) {
			interval = sm2.nextInterval(interval, ef, q);
			ef = sm2.updateEF(ef, q);
			console.log(`  iter ${n}: EF: ${ef} interval: ${interval}`);
		}
	}
}
