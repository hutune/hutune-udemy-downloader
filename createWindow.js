var windowNotOpenTitle = 'Open popup window';
var windowIsOpenTitle = 'Popup window is already open. Click to focus popup.';
var popupWindowId = false;

chrome.action.onClicked.addListener(function () {
    var width = 1092;
    var height = 700;
    if (popupWindowId === false) {
        popupWindowId = true;
        chrome.action.setTitle({ title: windowIsOpenTitle });
        chrome.windows.create({
            url: 'popup.html',
            type: 'popup',
            width: width,
            height: height,
            focused: true
        }, function (win) {
            popupWindowId = win.id;
        });
        return;
    } else if (typeof popupWindowId === 'number') {
        chrome.windows.update(popupWindowId, { focused: true });
    }
});

chrome.windows.onRemoved.addListener(function (winId) {
    if (popupWindowId === winId) {
        chrome.action.setTitle({ title: windowNotOpenTitle });
        popupWindowId = false;
    }
});