firebase.initializeApp({
	apiKey: "AIzaSyCoBSoxkU8QhZnQ7p0oy_vhSX-z-27QHj8",
	authDomain: "spanish-learning-assistant.firebaseapp.com",
	databaseURL: "https://spanish-learning-assistant.firebaseio.com",
	storageBucket: "spanish-learning-assistant.appspot.com",
});

firebase.auth().onAuthStateChanged(function(user) {
  if (!user) {
    // Let's try to get a Google auth token programmatically.
    startAuth(false);
  }
});

function startAuth(interactive) {
  // Request an OAuth token from the Chrome Identity API.
  chrome.identity.getAuthToken({ interactive: !!interactive }, function(token) {
    if (chrome.runtime.lastError && !interactive) {
      console.error(chrome.runtime.lastError);
      console.log('It was not possible to get a token programmatically.');
    } else if(chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
    } else if (token) {
      // Authrorize Firebase with the OAuth Access Token.
      var credential = firebase.auth.GoogleAuthProvider.credential(null, token);
      firebase.auth().signInWithCredential(credential).catch(function(error) {
        // The OAuth token might have been invalidated. Lets' remove it from cache.
        if (error.code === 'auth/invalid-credential') {
          chrome.identity.removeCachedAuthToken({token: token}, function() {
            startAuth(interactive);
          });
        }
      });
    } else {
      console.error('The OAuth Token was null');
    }
  });
}

const firebaseSchema = {
	users: {
		"user.uid": {
			profile: { email: "" },
			lang: {
				es: {
					lemmasKnown: [ "ir", "tener" ],
					studyHistory: {
						"<lemma>": {},
						"<infinitive>.<mood><tense><person><plural>": {
							"<pushID>": {
								ts: Date.now(),
								//correct: false,
								//got: "estas",
								quality: 5,
							},
						},
						// "cargar.IP1S": "cargo",
						// "cargar.IP1P": "cargaron",
					},
					studyCurrent: {
						"cargar.IP1S": {
							last: Date.now(),
							next: Date.now(),
							sm2: {
								ef: 2.5,
								interval: 1,
							},
						},
					},
				},
			},
		},
	},
};

const moodToTagset = {
	"Indicative.Present":   "IP",
	"Indicative.Preterite": "IS",
	"Indicative.Imperfect": "II",
	"Infinitive":           "N0",
	"Gerund":               "G0",
	"Participle":           "P0",
};

const tagsetToPronoun = {
	"1S": "yo",
	"2S": "tú",
	"3S": "él, ella, Ud.",
	"1P": "nos.",
	"2P": "vos.",
	"3P": "ellos, ellas, Uds.",
};

const tagsetToReflexivePronoun = {
	"1S": "me",
	"2S": "te",
	"3S": "se",
	"1P": "nos",
	"2P": "os",
	"3P": "se",
};

/*
nextToStudy({
	lemmas: [ "ir", "tener", "hacer" ],
	moods: [
		"Indicative.Present",   // I load        - cargo
		"Indicative.Preterite", // I loaded      - cargué
		"Indicative.Imperfect", // I was loading - cargaba
		"Infinitive",           // To load       - cargar
		"Gerund",               // Loading       - cargando
		"Participle",           // Loaded        - cargado
	],
});
*/

function testFirebaseDB() {
  var cb = cbLogger;
  var user = firebase.auth().currentUser;
  if (!user) {
    return cb("No current user found");
  }

  //firebase.database.enableLogging(true);
  var db = firebase.database();

  var user_profile_ref = db.ref("users/" + user.uid + "/profile");

  async.waterfall([
    function(cb) {
      user_profile_ref.set({
        email: user.email,
      }, cb);
    },
    function (undef, cb) {
      user_profile_ref.once("value").then(function(snapshot) {
        cb(null, snapshot.val());
      });
    },
  ], cb);
}
