document.addEventListener('selectionchange', function() {
	var sel = window.getSelection(),
        r = sel.rangeCount ? sel.getRangeAt(0) : null,
	    msg = {
			request: 'updateContextMenu',
			selection: sel.toString(),
			windowOffset: {
				x: window.screenX,
				y: window.screenY,
				innerH: window.innerHeight,
				outerH: window.outerHeight,
			},
		};
	if (r) {
		if (r.startContainer === r.endContainer && r.startContainer.nodeName === "#text") {
			msg.before = r.startContainer.textContent.slice(0, r.startOffset);
			msg.after  = r.startContainer.textContent.slice(r.endOffset);
		}
		var rects = r.getClientRects();
		if (rects.length >= 1) {
			var rect = rects[0];
			msg.selectionRect = {};
			for (k in rect) {
				msg.selectionRect[k] = rect[k];
			}
		}
	}
    chrome.runtime.sendMessage(msg);
});
