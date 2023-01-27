import * as sauce from '/pages/src/../../shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';

const doc = document.documentElement;
const L = sauce.locale;
const H = L.human;
const num = H.number;
const fieldsKey = 'nearby-fields-v2';
let imperial = common.storage.get('/imperialUnits');
L.setImperial(imperial);
let eventSite = common.storage.get('/externalEventSite', 'zwift');
let fieldStates;
let nearbyData;
let enFields;
let table;
let tbody;
let gameConnection;

common.settingsStore.setDefault({
    autoscroll: true,
    refreshInterval: 2,
    overlayMode: false,
    fontScale: 1,
    solidBackground: false,
    backgroundColor: '#00ff00',
});

const unit = x => `<abbr class="unit">${x}</abbr>`;
const spd = (v, entry) => H.pace(v, {precision: 0, suffix: true, html: true, sport: entry.state.sport});
const pwr = v => H.power(v, {suffix: true, html: true});
const hr = v => v ? num(v) + unit('bpm') : '&nbsp;';
const pct = v => (v != null && !isNaN(v) && v !== Infinity && v !== -Infinity) ? num(v) + unit('%') : '-';
const gapTime = (v, entry) => H.timer(v) + (entry.isGapEst ? '<small> (est)</small>' : ' ');

let overlayMode;
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


const lazyGetSubgroup = makeLazyGetter(id => common.rpc.getEventSubgroup(id));
const lazyGetRoute = makeLazyGetter(id => common.rpc.getRoute(id));


function fmtDist(v) {
    if (v == null || v === Infinity || v === -Infinity || isNaN(v)) {
        return '-';
    } else if (Math.abs(v) < 1000) {
        const suffix = unit(imperial ? 'ft' : 'm');
        return H.number(imperial ? v / L.metersPerFoot : v) + suffix;
    } else {
        return H.distance(v, {precision: 1, suffix: true, html: true});
    }
}
function fmtWkg(v, entry) {
    if (v == null) {
        return '-';
    }
    const wkg = v / (entry.athlete && entry.athlete.weight);
    return (wkg !== Infinity && wkg !== -Infinity && !isNaN(wkg)) ?
        num(wkg, {precision: 1, fixed: true}) + unit(' W/kg') : '&nbsp;';
}
function fmtName(name, entry) {
    let badge;
    const sgid = entry.state.eventSubgroupId;
    if (sgid) {
        const sg = lazyGetSubgroup(sgid);
        if (sg) {
            badge = common.eventBadge(sg.subgroupLabel);
        }
    }

    return athleteLink(entry.athleteId, (badge || '') + formatNameO101(entry));
}
function fmtRoute({route, laps}) {
    if (!route) {
        return '-';
    }
    const parts = [];
    if (laps) {
        parts.push(`${laps} x`);
    }
    parts.push(route.name);
    return parts.join(' ');
}
function fmtEvent(sgid) {
    if (!sgid) {
        return '-';
    }
    const sg = lazyGetSubgroup(sgid);
    if (sg) {
        return `<a href="${eventUrl(sg.event.id)}" target="_blank" external>${sg.event.name}</a>`;
    } else {
        return '...';
    }
}


function getRoute({state}) {
    if (state.eventSubgroupId) {
        const sg = lazyGetSubgroup(state.eventSubgroupId);
        if (sg) {
            return {route: sg.route, laps: sg.laps};
        }
    } else if (state.routeId) {
        return {route: lazyGetRoute(state.routeId), laps: 0};
    }
    return {};
}


function eventUrl(id) {
    const urls = {
        zwift: `https://www.zwift.com/events/view/${id}`,
        zwiftpower: `https://zwiftpower.com/events.php?zid=${id}`,
    };
    return urls[eventSite] || urls.zwift;
}


function clearSelection() {
    window.getSelection().empty();
}


function athleteLink(id, content, options={}) {
    const debug = location.search.includes('debug') ? '&debug' : '';
    return `<a title="${options.title || ''}" class="athlete-link ${options.class || ''}"
               href="/pages/profile.html?id=${id}&width=800&height=345${debug}"
               target="_blank">${content || ''}</a>`;
}

const fieldGroups = [{
    group: 'athlete',
    label: 'Athlete',
    fields: [        
        {id: 'nation', defaultEn: true, label: 'Country Flag', headerLabel: '<ms>flag</ms>',
         get: x => x.athlete && x.athlete.countryCode, fmt: common.fmtFlag},
        {id: 'f-last', defaultEn: false, label: 'F. Last', get: x => x.athlete && x.athlete.fLast,
         fmt: fmtName},
        {id: 'initials', defaultEn: false, label: 'Name Initials', headerLabel: ' ',
         get: x => x.athlete && x.athlete.initials, fmt: fmtName},
        {id: 'team', defaultEn: false, label: 'Team', get: x => x.athlete && x.athlete.team,
         fmt: common.teamBadge},
        {id: 'distance', defaultEn: false, label: 'Distance', headerLabel: 'Dist',
         get: x => x.state.distance, fmt: fmtDist},
        {id: 'event-distance', defaultEn: false, label: 'Event Distance', headerLabel: 'Ev Dist',
         get: x => x.state.eventDistance, fmt: fmtDist},
    ],
}, {
    group: 'event',
    label: 'Event / Road',
    fields: [
        {id: 'gap', defaultEn: true, label: 'Gap', get: x => x.gap, fmt: gapTime},
        {id: 'gap-distance', defaultEn: false, label: 'Gap (dist)', get: x => x.gapDistance, fmt: fmtDist},
        {id: 'position', defaultEn: false, label: 'Event Position', headerLabel: 'Pos',
         get: x => x.eventPosition, fmt: num},
        {id: 'event', defaultEn: false, label: 'Event', headerLabel: '<ms>event</ms>',
         get: x => x.state.eventSubgroupId, fmt: fmtEvent},
        {id: 'route', defaultEn: false, label: 'Route', headerLabel: '<ms>route</ms>',
         get: getRoute, fmt: fmtRoute},
        {id: 'progress', defaultEn: false, label: 'Route %', headerLabel: 'RT %',
         get: x => x.state.progress * 100, fmt: pct},
    ],
}, {
    group: 'power',
    label: 'Power',
    fields: [
        {id: 'pwr-cur', defaultEn: true, label: 'Current Power', headerLabel: 'Pwr',
         get: x => x.state.power, fmt: pwr},
        {id: 'wkg-cur', defaultEn: true, label: 'Current Watts/kg', headerLabel: 'W/kg',
         get: x => x.state.power, fmt: fmtWkg},
    ],
}, {
    group: 'speed',
    label: 'Speed',
    fields: [
        {id: 'spd-cur', defaultEn: true, label: 'Current Speed', headerLabel: 'Spd',
         get: x => x.state.speed, fmt: spd},
        {id: 'spd-avg', defaultEn: true, label: 'Total Average', headerLabel: 'Spd (avg)',
         get: x => x.stats.speed.avg, fmt: spd},
    ],
}, {
    group: 'hr',
    label: 'Heart Rate',
    fields: [
        {id: 'hr-cur', defaultEn: true, label: 'Current Heart Rate', headerLabel: 'HR',
         get: x => x.state.heartrate || null, fmt: hr},
        {id: 'hr-avg', defaultEn: true, label: 'Total Average', headerLabel: 'HR (avg)',
         get: x => x.stats.hr.avg, fmt: hr},
    ],
}, {
    group: 'draft',
    label: 'Draft',
    fields: [
        {id: 'draft', defaultEn: false, label: 'Current Draft', headerLabel: 'Draft',
         get: x => x.state.draft, fmt: pct},
        {id: 'draft-60s', defaultEn: false, label: '1 min average', headerLabel: 'Draft (1m)',
         get: x => x.stats.draft.smooth[60], fmt: pct},
        {id: 'draft-300s', defaultEn: false, label: '5 min average', headerLabel: 'Draft (5m)',
         get: x => x.stats.draft.smooth[300], fmt: pct},
        {id: 'draft-1200s', defaultEn: false, label: '20 min average', headerLabel: 'Draft (20m)',
         get: x => x.stats.draft.smooth[1200], fmt: pct},
        {id: 'draft-avg', defaultEn: false, label: 'Total Average', headerLabel: 'Draft (avg)',
         get: x => x.stats.draft.avg, fmt: pct},
    ],

}, {
    group: 'debug',
    label: 'Debug',
    fields: [
        //{id: 'index', defaultEn: false, label: 'Data Index', headerLabel: 'Idx', get: x => x.index},
        {id: 'id', defaultEn: false, label: 'Athlete ID', headerLabel: 'ID', get: x => x.athleteId},
        {id: 'course', defaultEn: false, label: 'Course (aka world)', headerLabel: '<ms>map</ms>',
         get: x => x.state.courseId},
        {id: 'direction', defaultEn: false, label: 'Direction', headerLabel: 'Dir',
         get: x => x.state.reverse, fmt: x => x ? '<ms>arrow_back</ms>' : '<ms>arrow_forward</ms>'},
        {id: 'latency', defaultEn: false, label: 'Latency',
         get: x => x.state.latency, fmt: x => H.number(x, {suffix: 'ms', html: true})},
        {id: 'power-up', defaultEn: false, label: 'Active Power Up', headerLabel: 'PU',
         get: x => x.state.activePowerUp, fmt: x => x ? x.toLowerCase() : ''},
        {id: 'event-leader', defaultEn: false, label: 'Event Leader', headerLabel: '<ms>star</ms>',
         get: x => x.eventLeader, fmt: x => x ? '<ms style="color: gold">star</ms>' : ''},
        {id: 'event-sweeper', defaultEn: false, label: 'Event Sweeper', headerLabel: '<ms>mop</ms>',
         get: x => x.eventSweeper, fmt: x => x ? '<ms style="color: darkred">mop</ms>' : ''},
    ],
}];


export async function main() {
    common.initInteractionListeners();
    let onlyMarked = common.settingsStore.get('onlyMarked');
    let onlySameCategory= common.settingsStore.get('onlySameCategory');
    let onlySameTeam= common.settingsStore.get('onlySameTeam');
    let refresh;
    const setRefresh = () => {
        refresh = (common.settingsStore.get('refreshInterval') || 0) * 1000 - 100; // within 100ms is fine.
    };
    const gcs = await common.rpc.getGameConnectionStatus();
    gameConnection = !!(gcs && gcs.connected);
    doc.classList.toggle('game-connection', gameConnection);
    common.subscribe('status', gcs => {
        gameConnection = gcs.connected;
        doc.classList.toggle('game-connection', gameConnection);
    }, {source: 'gameConnection'});
    common.settingsStore.addEventListener('changed', async ev => {
        const changed = ev.data.changed;
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {
            setBackground();
        }
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
    common.storage.addEventListener('globalupdate', ev => {
        if (ev.data.key === '/imperialUnits') {
            L.setImperial(imperial = ev.data.value);
        } else if (ev.data.key === '/exteranlEventSite') {
            eventSite = ev.data.value;
        }
    });
    setBackground();
    const fields = [].concat(...fieldGroups.map(x => x.fields));
    fieldStates = common.storage.get(fieldsKey, Object.fromEntries(fields.map(x => [x.id, x.defaultEn])));
    render();
    tbody.addEventListener('dblclick', async ev => {
        const row = ev.target.closest('tr');
        if (row) {
            clearSelection();
            if (gameConnection) {
                await watch(Number(row.dataset.id));
            }
        }
    });
    tbody.addEventListener('click', async ev => {
        const link = ev.target.closest('.link');
        if (link) {
            ev.stopPropagation();
            const athleteId = Number(ev.target.closest('tr').dataset.id);
            if (link.dataset.id === 'watch') {
                await watch(athleteId);
            }
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


async function watch(athleteId) {
    await common.rpc.watch(athleteId);
    if (nearbyData) {
        for (const x of nearbyData) {
            x.watching = x.athleteId === athleteId;
        }
        renderData(nearbyData);
    }
}


function render() {
    doc.classList.toggle('autoscroll', common.settingsStore.get('autoscroll'));
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);
    const fields = [].concat(...fieldGroups.map(x => x.fields));
    enFields = fields.filter(x => fieldStates[x.id]);
    table = document.querySelector('#content table');
    tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
}


function makeTableRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = createTableRowInnerHtmlO101(false);
    return tr;
}


function gentleClassToggle(el, cls, force) {
    const has = el.classList.contains(cls);
    if (has && !force) {
        el.classList.remove(cls);
    } else if (!has && force) {
        el.classList.add(cls);
    }
}


let frames = 0;
let maxNearbyRiders = 28; //will be the total around watched rider
function renderData(data, {recenter}={}) {
    if (!data || !data.length || document.hidden) {
        return;
    }
    const centerIdx = data.findIndex(x => x.watching);
    const watchingRow = tbody.querySelector('tr.watching') || tbody.appendChild(makeTableRow());
    let row = watchingRow;
    for (let i = centerIdx; i >= 0 && i >= centerIdx-maxNearbyRiders/2; i--) {
        updateTableRowO101(row, data[i]);
        if (i) {
            row = row.previousElementSibling || row.insertAdjacentElement('beforebegin', makeTableRow());
            gentleClassToggle(row, 'hidden', false);
        }
    }
    while (row.previousElementSibling) {
        gentleClassToggle(row = row.previousElementSibling, 'hidden', true);
    }
    row = watchingRow;
    for (let i = centerIdx + 1; i < data.length && i <= centerIdx+maxNearbyRiders/2; i++) {
        row = row.nextElementSibling || row.insertAdjacentElement('afterend', makeTableRow());
        updateTableRowO101(row, data[i]);
        gentleClassToggle(row, 'hidden', false);
    }
    while (row.nextElementSibling) {
        gentleClassToggle(row = row.nextElementSibling, 'hidden', true);
    }
    if ((!frames++ || recenter) && common.settingsStore.get('autoscroll')) {
        requestAnimationFrame(() => {
            const row = tbody.querySelector('tr.watching');
            if (row) {
                row.scrollIntoView({block: 'center'});
            }
        });
    }
    
    updateNearbyHeadO101(data[centerIdx]);
}


function setBackground() {
    const {solidBackground, backgroundColor} = common.settingsStore.get();
    doc.classList.toggle('solid-background', !!solidBackground);
    if (solidBackground) {
        doc.style.setProperty('--background-color', backgroundColor);
    } else {
        doc.style.removeProperty('--background-color');
    }
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
    for (const {fields, label} of fieldGroups) {
        form.insertAdjacentHTML('beforeend', [
            '<div class="field-group">',
                `<div class="title">${label}:</div>`,
                ...fields.map(x => `
                    <label title="${common.sanitizeAttr(x.tooltip || '')}">
                        <key>${x.label}</key>
                        <input type="checkbox" name="${x.id}" ${visibleDataO101.includes(x.id) ? 'checked' : ''}/>
                    </label>
                `),
            '</div>'
        ].join(''));
    }
    await common.initSettingsForm('form#options')();
}

const visibleDataO101 = ['initials','f-last','team','gap','gap-distance','hr-cur','wkg-cur'];

function updateTableRowO101(row, info) {
    if (row.title && !gameConnection) {
        row.title = '';
    } else if (!row.title && gameConnection) {
        row.title = 'Double click row to watch this athlete';
    }
    
    gentleClassToggle(row, 'watching', info.watching);
    if (!common.settingsStore.get('onlySameTeam')) {
        gentleClassToggle(row, 'marked', info.athlete && info.athlete.marked);
        gentleClassToggle(row, 'following', info.athlete && info.athlete.following);
    }
    if (row.dataset.id !== '' + info.athleteId) {
        row.dataset.id = info.athleteId;
    }

    let wkgCurColor = '';
    let isInGroup = '';
    let rowHtml = createTableRowInnerHtmlO101(true);

    for (const [i, {id, get, fmt}] of enFields.entries()) {
        if(!visibleDataO101.includes(id)) continue;

        let value;
        try {
            value = get ? get(info) : info;
        } catch(e) {
            value = null;
        }

        let html = '' + (fmt ? fmt(value, info) : value != null ? value : '');

        if (id === 'gap') {
            if (value > -1 && value < 1) {
                html = '&nbsp;';
                isInGroup = true;
            } else {
                const isMin = html.indexOf('-') >= 0;
                html = html.replace('-', '');
                if (html.indexOf(':') < 0) {
                    html = html < 10 ? '0:0'+html : '0:'+html;
                }
                html = isMin ? '-'+html: '+'+html;
            }
        }

        if (id === 'gap-distance') {
            if (value > -5 && value < 5) {
                html = '&nbsp;';
            } else {
                html = html.replace('-', '');
            }
        }

        if (id === 'wkg-cur') {
            let wkg = value / (info.athlete && info.athlete.weight);
            if (wkg>=5) {
                wkgCurColor = 'col-wkg-cur-orange';
            }
            if (wkg>=8) {
                wkgCurColor = 'col-wkg-cur-red';
            }
            if (wkg>=11) {
                wkgCurColor = 'col-wkg-cur-purple';
            }
        }
        
        rowHtml = rowHtml.replace('_'+visibleDataO101.indexOf(id), html);
    }

    let bgSpecial = 'is-rider-out-of-group';
    if (isInGroup === true) {
        bgSpecial = info.watching === true ? 'is-rider-me' : 'is-rider-in-group';
    } 
    if (info.athlete != null && info.athlete.type != null && info.athlete.type !== 'NORMAL') {
        bgSpecial = 'is-rider-special';
    }
    
    rowHtml = rowHtml.replace('_bg-special_', bgSpecial);
    rowHtml = rowHtml.replace('_wkg-cur-color_', wkgCurColor);

    row.innerHTML = rowHtml;
}

function createTableRowInnerHtmlO101(withWkgCurColor) {
    let html = '<td><div class="o101 _bg-special_ _wkg-cur-color_">';
    html += '<div class="row-top"><div class="col-f-last">_1</div><div class="col-team">_2</div></div>';
    html += '<div class="row-bottom"><div class="col-gap">_3</div><div class="col-gap-distance">_4</div><div class="col-hr-cur">_5</div><div class="col-wkg-cur">_6</div></div>';
    html += '</div></td>';

    return withWkgCurColor ? html : html.replace('_wkg-cur-color_', '');
}

function formatNameO101(info) {
    let first = info != null && info.athlete != null && Object.hasOwn(info.athlete, 'initials') ? info.athlete.initials : '';
    let last = info != null && info.athlete != null && Object.hasOwn(info.athlete, 'lastName') ? info.athlete.lastName : '';
            
    if (first.length>0 && last.length>0) {
        first = first.substring(0,1).toUpperCase();
        last = stripSpamFromNameO101(last);

        if (last.length>1) {
            last = last.substring(0,1).toUpperCase() + last.substring(1).toLowerCase()
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

    return first + '. ' + last;
}

function stripSpamFromNameO101(value) {
    const spamChars = ['[','(','/','|',',','#','-','Team','TEAM','team','Year','YEAR','year'];

    for (let i = 0; i < spamChars.length; i++) {
        if (value.indexOf(spamChars[i])>0) {
            const nameParts = value.split(spamChars[i]);
            value = nameParts[0];
        }
    }

    return value;
}

function updateNearbyHeadO101(info) {
    const contentDivHead = document.querySelector('#content div.o101-head');

    if (contentDivHead != null && info.eventPosition != null && info.eventPosition > 0 && info.eventParticipants != null && info.eventParticipants > 0) {
        contentDivHead.innerHTML = 'Position ' + info.eventPosition + ' of ' + info.eventParticipants;
    } else {
        contentDivHead.innerHTML = 'Zwifters nearby';
    }
}
