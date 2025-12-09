import * as common from '/pages/src/common.mjs';
import * as o101Common from './o101/common.mjs';
import * as o101UiLib from './o101/ui-lib.mjs';
import * as o101Ext from './o101/extensions.mjs';

const doc = document.documentElement;

const getTeam = (athlete) => {
    const overrider = o101Common.getOverRider(athlete.id);
    let teamBadgeOverride = (overrider!= null) ? overrider.team : null;
    return o101Common.fmtTeamBadgeV2(athlete, true, teamBadgeOverride);
}

const createRider = (athlete) => {
    const id = athlete.id;
    const overrider = o101Common.getOverRider(id);
    
    return {
        id: id,
        name: (overrider!= null) ? overrider.alias : o101Common.fmtName(athlete),
        team: getTeam(athlete),
        flag: o101Common.fmtFlag(athlete)        
    };
}

export async function fanviewer() {
    common.initInteractionListeners();
    common.subscribe('athlete/watching', updateMetrics);
    common.settingsStore.addEventListener('changed', initialize);
    
    o101Common.initNationFlags();
    await o101Common.initTeamColors();    
    await o101Common.initOverRiders();    
    await initialize();
}

export async function watch(value, id) {
    switch(value) {
        case 'watchAthleteById': { await watchRider(id); break; }

        case 'watchFirstOfRace': { await watchFirstOfRace(); break; }
        case 'watchLastOfRace': { await watchLastOfRace(); break; }
        
        case 'watchFirstOfGroup': { await watchFirstOfGroup(); break; }
        case 'watchCenterOfGroup': { await watchCenterOfGroup(); break; }
        case 'watchLastOfGroup': { await watchLastOfGroup(); break; }
    }
}

export async function changeCamera() {
    await common.rpc.changeCamera();   
}

function updateMetrics(info) {
    setValue('#speed', o101Common.formatNumber(info.state.speed, 0) + '<abbr class="speed">kph</abbr>');
    setValue('#power', info.state.power + '<abbr class="power">W</abbr>', null, o101Common.fmtWkg(info));
    setValue('#powerwkg', o101Common.fmtWkg(info) + '<abbr class="power">Wkg</abbr>', null, o101Common.fmtWkg(info));
}

function setValue(id, value, img, wkg = 0) {
    const div = doc.querySelector(id);
        
    if (div == null || value == null) return '&nbsp';
    
    if (img != null){
        div.innerHTML = value + img;
    } else {
        div.innerHTML = value;
        div.withWkgColor(wkg);
    }
}

async function initialize() {
    await loadMarkedRiders();
    await loadRoboPacers();
}

async function loadMarkedRiders() {
    const div = doc.querySelector('#marked-riders div.content');
    div.innerHTML = '';

    const markedAthletes = await common.rpc.getMarkedAthletes();
    const markedRiders = markedAthletes.map(a => { return createRider(a); });
    for (let athlete of markedRiders) {
        div.appendChild(createAthleteDiv(athlete));
    }
}

async function loadRoboPacers() {
    const div = doc.querySelector('#robo-pacers div.content');
    div.innerHTML = '';
    
    const worldId = await getWorldIdOfWatchedRider();
    let roboPacers = [];

    switch (parseInt(worldId)) {
        case 1: { // Watopia
            roboPacers = [5147250,5147260,5147267,5147276,5147285,5162620,5147292,5147294,5147298];
            break;
        }
        case 4: { // New York
            roboPacers = [5147310,5147311,5147315,5162617];
            break;
        }
        case 9: { // Makuri Islands
            roboPacers = [5147303,5147317,5147320,5147324,5147325];
            break;
        }
        case 10: { // France
            roboPacers = [5147303,5147311,5147317,5162617,5147320,5147324,5147325];
            break;
        }
        case 11: { // Paris
            roboPacers = [5147310,5147315];
            break;
        }
        case 13: { // Scotland
            roboPacers = [5147303,5147311,5147317,5147320];
            break;
        }        
    }

    for (let rp of roboPacers) {
        const roboPacer = await common.rpc.getAthlete(rp)
        const athlete = {
            id: roboPacer.id,
            name: roboPacer.fLast,
            team: o101Common.fmtTeamBadgeV2(roboPacer, true, 'ZWIFT'),
            flag: ''
        };

        div.appendChild(createAthleteDiv(athlete));
    }
}

async function watchFirstOfRace() {
    let nearbyData = await common.rpc.getNearbyData();
    if (nearbyData == null) {
        console.log('No nearby data');
        return;
    };

    const rider = nearbyData.sortAndFixEventPosition()[0];
    await watchRider(rider.athleteId);
}

async function watchLastOfRace() {
    let nearbyData = await common.rpc.getNearbyData();
    if (nearbyData == null) {
        console.log('No nearby data');
        return;
    };

    const rider = nearbyData.sortAndFixEventPosition()[nearbyData.length-1];
    await watchRider(rider.athleteId);
}

async function watchFirstOfGroup() {
    const myGroup = await getMyGroup();
    if (myGroup == null) return;

    const rider = myGroup.athletes.sortAndFixEventPosition()[0];
    await watchRider(rider.athleteId);
}

async function watchCenterOfGroup() {
    const myGroup = await getMyGroup();
    if (myGroup == null) return;

    const rider = myGroup.athletes.sortAndFixEventPosition()[Math.trunc(myGroup.athletes.length/2)];
    await watchRider(rider.athleteId);
}

async function watchLastOfGroup() {
    const myGroup = await getMyGroup();
    if (myGroup == null) return;

    const rider = myGroup.athletes.sortAndFixEventPosition()[myGroup.athletes.length-1];
    await watchRider(rider.athleteId);
}

async function getMyGroup() {
    let groupsData = await common.rpc.getGroupsData();
    if (groupsData == null) {
        console.log('No groups data');
        return null;
    };

    for (let group of groupsData) {
        if (group.athletes.some(a => a.watching)) { 
            return group;
        }
    }

    return null;
}

async function watchRider(id) {
    await common.rpc.watch(id); 
}

async function getWorldIdOfWatchedRider() {
    const myGroup = await getMyGroup();
    if (myGroup == null) return 0;

    const rider = myGroup.athletes.filter(a => a.watching)[0];
    const route = await common.rpc.getRoute(rider.state.routeId);

    return (route != null) ? route.worldId : 0;
}

function createAthleteDiv(athlete) {
    let divAthlete = o101UiLib
        .createDiv(['action-item'])
        .withChildDiv(['action-item-name'], athlete.name)
        .withChildDiv(['action-item-team'], athlete.team)
        .withChildDiv(['action-item-flag'], athlete.flag);
    divAthlete.onclick = function() { watch('watchAthleteById', athlete.id); };

    return divAthlete;
}