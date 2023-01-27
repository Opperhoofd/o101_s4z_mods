import * as sauce from '/pages/src/../../shared/sauce/index.mjs';
import * as common from '/pages/src/common.mjs';

const num = sauce.locale.human.number;
const mainDiv = document.querySelector('#o101-main');

export async function main() {
    common.initInteractionListeners();
    common.subscribe('athlete/watching', watching => {
        updateMetrics(watching);
        console.log(watching);
    });

}

function updateMetrics(info) {
    setValue('#cur-power-wkg', getPowerWkg(info), 'W/kg');
    setValue('#cur-power', info.state.power, 'W');
    setValue('#cur-cad', info.state.cadence, 'rpm');
    setValue('#cur-hr', info.state.heartrate, 'bpm');
    setValue('#cur-draft', info.state.draft, '%');
    setValue('#cur-wball', num(info.stats.power.wBal/1000, {precision: 0, fixed: true}), 'kJ');
}


function getPowerWkg(info) {
    if (info.state.power == null || info.athlete.weight == null) return null;    

    const wkg = info.state.power / info.athlete.weight;

    return num(wkg, {precision: 1, fixed: true});
}

function setValue(id, value, unit) {
    const div = mainDiv.querySelector(id);
        
    if (div == null || value == null) return '&nbsp';
    
    div.innerHTML = '<span class="value">'+value+'<span><span class="unit">'+unit+'<span>';
}