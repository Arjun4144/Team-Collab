/**
 * Call Service — Manages call state as a simple observable store.
 * Isolated from the main Zustand store to avoid coupling.
 */

let _listeners = [];
let _state = {
  inCall: false,
  channelId: null,
  participants: [],
  activeCallInfo: null, // { channelId, participants, startedBy } — for channels with active calls
};

function getState() {
  return { ..._state };
}

function setState(partial) {
  _state = { ..._state, ...partial };
  _listeners.forEach(fn => fn(_state));
}

function subscribe(fn) {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter(l => l !== fn);
  };
}

function reset() {
  setState({
    inCall: false,
    channelId: null,
    participants: [],
    activeCallInfo: null,
  });
}

const callService = { getState, setState, subscribe, reset };

export default callService;
