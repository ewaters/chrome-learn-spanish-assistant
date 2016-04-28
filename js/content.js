document.addEventListener('selectionchange', function() {
	var sel = window.getSelection(),
        r = sel.rangeCount ? sel.getRangeAt(0) : null,
        rect = r ? r.getClientRects()[0] : null,
	    msg = {
			request: 'updateContextMenu',
			selection: sel.toString(),
			rect: rect,
		};
	if (r && r.startContainer === r.endContainer && r.startContainer.nodeName === "#text") {
		msg.before = r.startContainer.textContent.slice(0, r.startOffset);
		msg.after  = r.startContainer.textContent.slice(r.endOffset);
	}
    chrome.runtime.sendMessage(msg);
});
