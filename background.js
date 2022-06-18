/* global browser */

(async () => {


    const log = (level, msg) => {
        level = level.trim().toLowerCase();
        if (['error','warn'].includes(level)
            || ( temporary && ['debug','info','log'].includes(level))
        ) {
            console[level](extname + '::' + level.toUpperCase() + '::' + msg);
            return;
        }
    };



    function setMuted(tabId, muted) {
        browser.tabs.update(tabId, { muted });
    }

    function onRemoved(tabId /*, removeInfo*/) {
        if( tabIdStore.has(tabId) ) {
            tabIdStore.delete(tabId);
        }
    }

    // false := unmanaged / aka. all tabs / default
    // true := only managed / selected
    async function getMode() {

        log('debug', 'getMode');
        let store = undefined;
        try {
            store = await browser.storage.local.get('mode');
        }catch(e){
            log('debug', 'access to storage failed');
            return false;
        }
        if( typeof store === 'undefined') {
            log('debug', 'store is undefined');
            return false;
        }
        if( typeof store.mode !== 'boolean') {
            log('debug', 'store.mode is not boolean');
            return false;
        }
        return store.mode;
    }

    async function getWhitelist() {
        log('debug', 'getWhitelist');


        let store = undefined;
        try {
            store = await browser.storage.local.get('selectors');
        }catch(e){
            log('debug', 'access to storage failed');
            return [];
        }

        if( typeof store === 'undefined') {
            log('debug', 'store is undefined');
            return [];
        }

        if( typeof store.selectors === 'undefined') {
            log('debug', 'store.selectors is undefined');
            return [];
        }

        if ( typeof store.selectors.forEach !== 'function' ) {
            log('error', 'store.selectors is not iterable');
            return [];
        }

        const wlist = [];

        store.selectors.forEach( (selector) => {

            // check activ
            if(typeof selector.activ !== 'boolean') { return; }
            if(selector.activ !== true) { return; }

            // check url regex
            if(typeof selector.url_regex !== 'string') { return; }
            selector.url_regex = selector.url_regex.trim();
            if(selector.url_regex === ''){ return; }

            try {
                wlist.push(new RegExp(selector.url_regex));
            } catch(e) {
                log('WARN', 'invalid url regex : ' + selector.url_regex);
                return;
            }

        });

        return wlist;

    }

    function isWhiteListed(url) {
        for (var i=0;i < wlist.length;i++) {
            if(wlist[i].test(url)) {
                return true;
            }
        }
        return false;
    }

    async function updateMuteState_unmanaged() {
        log('debug', 'updateMuteState_unmanaged');
        let tabs = await browser.tabs.query({active: true, currentWindow: true});
        const aid = tabs[0].id;
        tabs = await browser.tabs.query({url: "<all_urls>"});
        tabs.forEach( async (tab) => {
            if(isWhiteListed(tab.url)){
                browser.browserAction.setBadgeText({tabId: tab.id, text: "NA" });
                browser.browserAction.setBadgeBackgroundColor({tabId: tab.id, color: 'yellow'});
                return;
            }
            if( tabIdStore.has(tab.id) ) {
                browser.browserAction.setBadgeText({tabId: tab.id, text: "OFF" });
                browser.browserAction.setBadgeBackgroundColor({tabId: tab.id, color: 'red'});
            } else {
                setMuted(tab.id, tab.id !== aid);
                browser.browserAction.setBadgeText({tabId: tab.id, text: "ON" });
                browser.browserAction.setBadgeBackgroundColor({tabId: tab.id, color: 'green'});
            }
        });
    }


    async function updateMuteState_managed() {
        log('debug', 'updateMuteState_managed');
        let tabs = await browser.tabs.query({active: true, currentWindow: true});
        const aid = tabs[0].id;
        tabs = (await browser.tabs.query({url: "<all_urls>"}));
        tabs.forEach( async (tab) => {
            if(isWhiteListed(tab.url)){
                browser.browserAction.setBadgeText({tabId: tab.id, text: "NA" });
                browser.browserAction.setBadgeBackgroundColor({tabId: tab.id, color: 'yellow'});
                return;
            }
            if( tabIdStore.has(tab.id) ) {
                setMuted(tab.id, tab.id !== aid);
                browser.browserAction.setBadgeText({tabId: tab.id, text: "ON" });
                browser.browserAction.setBadgeBackgroundColor({tabId: tab.id, color: 'green'});
            } else {
                browser.browserAction.setBadgeText({tabId: tab.id, text: "OFF" });
                browser.browserAction.setBadgeBackgroundColor({tabId: tab.id, color: 'red'});
            }
        });
    }

    async function onClicked(){
        log('debug', 'onClicked');

        const tabs = await browser.tabs.query({active: true, currentWindow: true});
        const atab = tabs[0];
        const aid = atab.id;

        if(mode) { // managed
            if( tabIdStore.has(aid) ){
                tabIdStore.delete(aid);
            }else{
                tabIdStore.add(aid);
            }
        }else {  // unmanaged - default
            if( tabIdStore.has(aid) ){
                tabIdStore.delete(aid);
            }else{
                tabIdStore.add(aid);
            }
        }
        updateMuteState();
    }

    function updateMuteState(){
        log('debug', "mode: " + mode);
        if(mode){
            updateMuteState_managed();
        }else{
            updateMuteState_unmanaged();
        }
    }

    async function onStorageChange(/*changes, area*/){
        log('debug', 'onStorageChange');

        mode = await getMode();
        wlist = await getWhitelist();

        // clear
        tabIdStore.clear();
        // maybe we should also clear the mute states ... but i am lazy, let the users do that
        updateMuteState();
    }

    const temporary = browser.runtime.id.endsWith('@temporary-addon'); // debugging?
    const manifest = browser.runtime.getManifest();
    const extname = manifest.name;

    let mode = await getMode();
    let wlist = await getWhitelist();
    let tabIdStore = new Set();

    browser.browserAction.setBadgeBackgroundColor({color: 'white'});

    // add listeners
    browser.browserAction.onClicked.addListener(onClicked);
    browser.tabs.onRemoved.addListener(onRemoved);
    browser.tabs.onActivated.addListener(updateMuteState);
    browser.windows.onFocusChanged.addListener(updateMuteState);
    browser.runtime.onInstalled.addListener(updateMuteState);

    browser.storage.onChanged.addListener(onStorageChange);

})();
