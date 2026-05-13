document.getElementById("closeCurtain").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLOSE_CURTAIN_TAB" }, () => {
    window.close();
  });
});
