import * as common from '/pages/src/common.mjs';
import * as o101Common from './o101/common.mjs';
import * as o101UiLib from './o101/ui-lib.mjs';
import * as o101Ext from './o101/extensions.mjs';

const doc = document.documentElement;

common.settingsStore.setDefault({
    myZwiftID: 0,
});

const state = {
    myId: 0,
    watchingId: 0,
    showMarkedRiders: false,
    showRoboPacers: false,
};

const getTeam = (athlete) => {
    const overrider = o101Common.getOverRider(athlete.id);
    let teamBadgeOverride = (overrider!= null) ? overrider.team : null;
    return o101Common.fmtTeamBadgeV2(athlete, true, teamBadgeOverride);
}

const createRider = (athlete) => {
    return {
        id: athlete.id,
        name: o101Common.fmtName(athlete),
        team: getTeam(athlete),
        flag: o101Common.fmtFlag(athlete)        
    };
}

export async function main() {
    common.initInteractionListeners();
    common.subscribe('watching-athlete-change', athleteChange);
    //common.subscribe('athlete/watching', updateCams);
    common.settingsStore.addEventListener('changed', onSettingsChanged);
    
    o101Common.initNationFlags();
    await o101Common.initTeamColors();    
    await o101Common.initOverRiders();    
    await onSettingsChanged();
}

async function onSettingsChanged() {
    state.myId = common.settingsStore.get('myZwiftID');
    state.showMarkedRiders = common.settingsStore.get('showMarkedRiders');
    state.showRoboPacers = common.settingsStore.get('showRoboPacers');
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

async function initialize() {
    await loadMe();
    await loadMarkedRiders();
    await loadRoboPacers();
}

async function loadMe() {
    const div = doc.querySelector('#me');
    div.innerHTML = '';

    const athlete = await common.rpc.getAthlete(state.myId);
    if (athlete == null) return;

    const me = createRider({id:athlete.id, athlete});    

    div.appendChild(createAthleteDiv(me));
}

async function loadMarkedRiders() {
    const div = doc.querySelector('#markedRiders');
    div.innerHTML = '';
    if (!state.showMarkedRiders) return;

    const markedAthletes = await common.rpc.getMarkedAthletes();
    const markedRiders = markedAthletes.map(a => { return createRider(a); });
    for (let athlete of markedRiders) {
        div.appendChild(createAthleteDiv(athlete));
    }
}

async function loadRoboPacers() {
    const div = doc.querySelector('#roboPacers');
    div.innerHTML = '';
    if (!state.showRoboPacers) return;

    const worldId = await getWorldIdOfWatchedRider();
    let roboPacers = [];

    switch (worldId) {
        case 1: {
            roboPacers = [5147250,5147260,5147267,5147276,5147285,5162620,5147292,5147294,5147298];
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
    state.watchingId = id;
    await common.rpc.watch(id); 
}

async function athleteChange(id) {
    state.watchingId = id;
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
        .createDiv(['info-item', 'advanced'])
        .withChildDiv(['info-item-name-detailed'], athlete.name)
        .withChildDiv(['info-item-team'], athlete.team)
        .withChildDiv(['info-item-flag'], athlete.flag);
    divAthlete.onclick = function() { watch('watchAthleteById', athlete.id); };

    return divAthlete;
}