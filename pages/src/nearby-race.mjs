import * as sauce from '/pages/src/../../shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';

const doc = document.documentElement;
const fieldsKey = 'nearby-fields-v2';
const unit = x => `<abbr class="unit">${x}</abbr>`;
const lazyGetSubgroup = makeLazyGetter(id => common.rpc.getEventSubgroup(id));
const topRowsToUpdate = 10;
const bottomRowsToUpdate = 10;

let fieldStates;
let nearbyData;
let table;
let tbody;
let gameConnection;
let frames = 0;
let overlayMode;
let imperial = common.storage.get('/imperialUnits');

sauce.locale.setImperial(imperial);

common.settingsStore.setDefault({
    autoscroll: true,
    refreshInterval: 2,
    overlayMode: false,
    fontScale: 1,
    solidBackground: false,
    backgroundColor: '#00ff00',
});

if (window.isElectron) {
    overlayMode = !!window.electron.context.spec.overlay;
    doc.classList.toggle('overlay-mode', overlayMode);
    document.querySelector('#titlebar').classList.toggle('always-visible', overlayMode !== true);
    if (common.settingsStore.get('overlayMode') !== overlayMode) {
        // Sync settings to our actual window state, not going to risk updating the window now
        common.settingsStore.set('overlayMode', overlayMode);
    }
}

function makeLazyGetter(cb) {
    const getting = {};
    const cache = new Map();

    return function getter(key) {
        if (!cache.has(key)) {
            if (!getting[key]) {
                getting[key] = cb(key).then(value => {
                    cache.set(key, value || null);
                    if (!value) {
                        // Allow retry, especially for event data which is wonky
                        setTimeout(() => cache.delete(key), 10000);
                    }
                    delete getting[key];
                });
            }
            return;
        } else {
            return cache.get(key);
        }
    };
}


export async function main() {
    common.initInteractionListeners();
    let onlyMarked = common.settingsStore.get('onlyMarked');
    let onlySameCategory= common.settingsStore.get('onlySameCategory');
    let onlySameTeam= common.settingsStore.get('onlySameTeam');
    let refresh;
    const setRefresh = () => {
        refresh = (common.settingsStore.get('refreshInterval') || 0) * 1000 - 100; // within 100ms is fine.
    };

    render();
    
    const gcs = await common.rpc.getGameConnectionStatus();
    gameConnection = !!(gcs && gcs.connected);
    doc.classList.toggle('game-connection', gameConnection);
    common.subscribe('status', gcs => {
        gameConnection = gcs.connected;
        doc.classList.toggle('game-connection', gameConnection);
    }, {source: 'gameConnection'});


    common.settingsStore.addEventListener('changed', async ev => {
        const changed = ev.data.changed;
        if (window.isElectron && changed.has('overlayMode')) {
            await common.rpc.updateWindow(window.electron.context.id,
                {overlay: changed.get('overlayMode')});
            await common.rpc.reopenWindow(window.electron.context.id);
        }
        if (changed.has('refreshInterval')) {
            setRefresh();
        }
        if (changed.has('onlyMarked')) {
            onlyMarked = changed.get('onlyMarked');
        }
        if (changed.has('onlySameCategory')) {
            onlySameCategory = changed.get('onlySameCategory');
        }
        if (changed.has('onlySameTeam')) {
            onlySameTeam = changed.get('onlySameTeam');
        }        

        render();
        if (nearbyData) {
            renderData(nearbyData);
        }
    });

    common.storage.addEventListener('update', async ev => {
        if (ev.data.key === fieldsKey) {
            fieldStates = ev.data.value;
            render();
            if (nearbyData) {
                renderData(nearbyData);
            }
        }
    });

    tbody.addEventListener('click', async ev => {
        const tr = ev.target.closest('tr');
        if (tr) {
            ev.stopPropagation();
            const athleteId = Number(tr.dataset.id);
            await watchAthlete(athleteId);
        }
    });

    setRefresh();
    let lastRefresh = 0;
    common.subscribe('nearby', data => {
        if (onlyMarked) {
            data = data.filter(x => x.watching || (x.athlete && x.athlete.marked));
        }
        if (onlySameCategory) {
            const watching = data.find(x => x.watching);
            const sgid = watching && watching.state.eventSubgroupId;
            if (sgid) {
                data = data.filter(x => x.state.eventSubgroupId === sgid);
            }
        }
        if (onlySameTeam) {
            const watching = data.find(x => x.watching);
            const team = watching && watching.athlete.team;
            if (team) {
                data = data.filter(x => x.athlete && (x.athlete.team === team));
            }            
        }
        nearbyData = data;
        const elapsed = Date.now() - lastRefresh;
        if (elapsed >= refresh) {
            lastRefresh = Date.now();
            renderData(data);
        }
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    fieldStates = common.storage.get(fieldsKey);
    const form = document.querySelector('form#fields');
    form.addEventListener('input', ev => {
        const id = ev.target.name;
        fieldStates[id] = ev.target.checked;
        common.storage.set(fieldsKey, fieldStates);
    });
    await common.initSettingsForm('form#options')();
}


async function watchAthlete(athleteId) {
    await common.rpc.watch(athleteId);
    if (nearbyData) {
        for (const x of nearbyData) {
            x.watching = x.athleteId === athleteId;
            if (x.athleteId === athleteId) {
            }
        }
        renderData(nearbyData);
    }
}


function render() {
    doc.classList.toggle('autoscroll', common.settingsStore.get('autoscroll'));
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);
    table = document.querySelector('#content table');
    tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
}

function renderData(data, {recenter}={}) {
    if (!data || !data.length || document.hidden) {
        return;
    }
    const centerIdx = data.findIndex(x => x.watching);
    const watchingRow = tbody.querySelector('tr.watching') || tbody.appendChild(createTableRow());
    let row = watchingRow;
    for (let i = centerIdx; i >= 0 && i > centerIdx-topRowsToUpdate; i--) {
        updateTableRow(row, data[i]);
        if (i) {
            row = row.previousElementSibling || row.insertAdjacentElement('beforebegin', createTableRow());
            gentleClassToggle(row, 'hidden', false);
        }
    }
    while (row.previousElementSibling) {
        gentleClassToggle(row = row.previousElementSibling, 'hidden', true);
    }
    row = watchingRow;
    for (let i = centerIdx + 1; i < data.length && i <= centerIdx+bottomRowsToUpdate; i++) {
        row = row.nextElementSibling || row.insertAdjacentElement('afterend', createTableRow());
        updateTableRow(row, data[i]);
        gentleClassToggle(row, 'hidden', false);
    }
    while (row.nextElementSibling) {
        gentleClassToggle(row = row.nextElementSibling, 'hidden', true);
    }
    if ((!frames++ || recenter) && common.settingsStore.get('autoscroll')) {
        requestAnimationFrame(() => {            
            if (watchingRow) {
                watchingRow.scrollIntoView({block: 'center'});
            }
        });
    }
    updateNearbyHead(data[centerIdx]);
}


function updateNearbyHead(info) {
    const contentDivHead = document.querySelector('#content div.o101-head');

    if (contentDivHead != null && info.eventPosition != null && info.eventPosition > 0 && info.eventParticipants != null && info.eventParticipants > 0) {
        contentDivHead.innerHTML = 'Position ' + info.eventPosition + ' of ' + info.eventParticipants;
    } else {
        contentDivHead.innerHTML = 'Zwifters nearby';
    }
}

function createTableRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = createTableRowInnerHtml();
    return tr;
}

function updateTableRow(row, info) {       
    gentleClassToggle(row, 'watching', info.watching);
    
    if (row.dataset.id !== '' + info.athleteId) {
        row.dataset.id = info.athleteId;
    }
    
    if (!common.settingsStore.get('onlySameTeam')) {
        gentleClassToggle(row, 'marked', info.athlete && info.athlete.marked);
        gentleClassToggle(row, 'following', info.athlete && info.athlete.following);
    }

    let rowHtml = createTableRowInnerHtml();

    rowHtml = rowHtml.replace('_1', getCategoryBadge(info) + fmtName(info));
    rowHtml = rowHtml.replace('_2', fmtTeamName(info));
    rowHtml = rowHtml.replace('_3', fmtGapTime(info));
    rowHtml = rowHtml.replace('_4', fmtGapDistance(info));
    rowHtml = rowHtml.replace('_5', fmtHeartrate(info));
    rowHtml = rowHtml.replace('_6', fmtWkg(info));

    rowHtml = rowHtml.replace('_bg', getBackgroundClass(info));
    rowHtml = rowHtml.replace('_wkg', getWkgClass(info));

    row.innerHTML = rowHtml;
}

function createTableRowInnerHtml() {
    let html = '<td><div class="o101_bg_wkg">';
    html += '<div class="row-top"><div class="col-f-last">_1</div><div class="col-team">_2</div></div>';
    html += '<div class="row-bottom"><div class="col-gap">_3</div><div class="col-gap-distance">_4</div><div class="col-hr-cur">_5</div><div class="col-wkg-cur">_6</div><div class="col-wkg-cur-unit">W/kg</div></div>';
    html += '</div></td>';
    return html;
}

function fmtName(info) {
    let first = info != null && info.athlete != null && Object.hasOwn(info.athlete, 'initials') ? info.athlete.initials : '';
    let last = info != null && info.athlete != null && Object.hasOwn(info.athlete, 'lastName') ? info.athlete.lastName : '';
      
    if (first.length>0 && last.length>0) {
        first = first.substring(0,1).toUpperCase();
        last = stripSpamFromName(last);

        if (last.length>1) {
            last = last.substring(0,1).toUpperCase() + last.substring(1).toLowerCase()
        } else {
            last = last.substring(0,1).toUpperCase();
        }

        const lastParts = last.split(' ');
        last = '';
        for (let i = 0; i < lastParts.length; i++) {
            let lastPart = lastParts[i];
            if (lastPart.length>1) {
                lastPart = lastPart.substring(0,1).toUpperCase() + lastPart.substring(1).toLowerCase()
            }
            last += lastPart.replace(/[^A-Za-z]/g, '') + ' ';
        }
    }

    return first + '.' + last;
}
function fmtTeamName(info) {
    return (info != null && info.athlete != null && Object.hasOwn(info.athlete, 'team'))
        ? common.teamBadge(info.athlete.team)
        : '';
}
function fmtGapTime(info) {
    if (isInGroup(info)) {
        return '';
    } 
    
    var time = sauce.locale.human.timer(info.gap);
    var prefix = (time+'').indexOf('-')<0 ? '+' : '-';
    
    time = time.replace('-', '');
    
    if (time.indexOf(':')<0) {
        return prefix + time + 's';
    }

    return prefix + time;
}
function fmtGapDistance(info) {
    let distance = ''
    const value = info.gapDistance;

    if ((value == null || value === Infinity || value === -Infinity || isNaN(value) || isInGroup(info))) {
        return distance;
    } else if (Math.abs(value) < 1000) {
        const suffix = unit(imperial ? 'ft' : 'm');
        distance = sauce.locale.human.number(imperial ? value / L.metersPerFoot : value) + suffix;
    } else {
        distance = sauce.locale.human.distance(value, {precision: 1, suffix: true, html: true});
    }

    return distance.replace('-', '')
}
function fmtHeartrate(info) {
    const value = info.state.heartrate;
    return (value == null || value == 0) ? '' : '&#9829; ' + value;
}
function fmtWkg(info) {
    let wkg = info.state.power / (info.athlete && info.athlete.weight);
    
    return sauce.locale.human.number(wkg, {precision: 1, fixed: true});
}

function stripSpamFromName(value) {
    const spamChars = ['[','(','/','|',',','#','-','Team','TEAM','team','Year','YEAR','year'];

    for (let i = 0; i < spamChars.length; i++) {
        if (value.indexOf(spamChars[i])>0) {
            const nameParts = value.split(spamChars[i]);
            value = nameParts[0];
        }
    }

    return value;
}

function isInGroup(info) {
    const value = info.gap;
    return (value > -1 && value < 1);
}

function getCategoryBadge(info) {
    const sgid = info.state.eventSubgroupId;
    if (sgid) {
        const sg = lazyGetSubgroup(sgid);
        if (sg) {
            return common.eventBadge(sg.subgroupLabel);
        }
    }
    return '';
}

function getBackgroundClass(info) {
    let bgClass = '';

    if ((info.gap > -1 && info.gap < 1)) {
        bgClass = info.watching === true ? ' rider-me' : ' rider-in-group';
    } 
    if (info.athlete != null && info.athlete.type != null && info.athlete.type == '10') {
        // info.athlete.type: NORMAL|PRO_CYCLIST
        // pace partner == 10?
        bgClass = ' rider-special';
    }

    return bgClass;
}
function getWkgClass(info) {
    let wkg = info.state.power / (info.athlete && info.athlete.weight);
    if (wkg>=5) {
        return ' wkg-orange';
    }
    if (wkg>=8) {
        return ' wkg-red';
    }
    if (wkg>=11) {
        return ' wkg-purple';
    }

    return '';
}

function gentleClassToggle(el, cls, force) {
    const has = el.classList.contains(cls);
    if (has && !force) {
        el.classList.remove(cls);
    } else if (!has && force) {
        el.classList.add(cls);
    }
}