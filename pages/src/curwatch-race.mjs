import * as sauce from '/pages/src/../../shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';

const fieldsKey = 'curwatch-race-fields-v2';
const mainDiv = document.querySelector('#o101-main');

let fieldStates;

common.settingsStore.setDefault({
    noHUD: false,
});

export async function main() {
    common.initInteractionListeners();
    common.subscribe('athlete/watching', watching => {
        updateMetrics(watching);
    });
    common.storage.addEventListener('update', async ev => {
        if (ev.data.key === fieldsKey) {
            fieldStates = ev.data.value;
        }
        render();
    });
    common.settingsStore.addEventListener('changed', async ev => {
        render();
    });
    render();
}

export async function settingsMain() {
    common.initInteractionListeners();
    fieldStates = common.storage.get(fieldsKey);
    const form = document.querySelector('form#fields');
    form.addEventListener('input', ev => {
        const id = ev.target.name;
        fieldStates[id] = ev.target.checked;
        common.storage.set(fieldsKey, fieldStates);
        console.log('aaaa');
    });
    await common.initSettingsForm('form#options')();
}

function render() {
    const body = document.querySelector('body');

    if (common.settingsStore.get('noHUD')) {
        body.classList.add('noHUD');
    } else {
        body.classList.remove('noHUD');
    }
}

function updateMetrics(info) {
    setValue('#cur-power-wkg', getPowerWkg(info), 'W/kg');
    setValue('#cur-power', info.state.power, 'W');
    setValue('#cur-cad', info.state.cadence, 'rpm');
    setValue('#cur-hr', info.state.heartrate, 'bpm');
    setValue('#cur-draft', info.state.draft, '%');
    setValue('#cur-wball', sauce.locale.human.number(info.stats.power.wBal/1000, {precision: 0, fixed: true}), 'kJ');
}

function getPowerWkg(info) {
    if (info.state.power == null || info.athlete.weight == null) return null;    

    const wkg = info.state.power / info.athlete.weight;

    return sauce.locale.human.number(wkg, {precision: 1, fixed: true});
}

function setValue(id, value, unit) {
    const div = mainDiv.querySelector(id);
        
    if (div == null || value == null) return '&nbsp';
    
    div.innerHTML = value+'<div class="unit">'+unit+'<div>';
}