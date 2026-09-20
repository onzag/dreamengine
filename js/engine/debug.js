const debug = {
    ENABLED_BOND_CHANGE: true,
    ENABLED_TIME_FORWARD: true,
    ENABLED_TRIGGERS: true,
    ENABLED_WANDER: true,
    ENABLED_STATE_CHANGE: true,
    ENABLED_RULES: true,
    ENABLED_POSTURE_CHANGE: true,
    ENABLED_ITEM_CHANGE: true,
    ENABLED_FEASIBILITY_CHECK: true,
};

// Comment out the following lines to disable specific debug features
debug.ENABLED_BOND_CHANGE = false;
debug.ENABLED_TIME_FORWARD = false;
debug.ENABLED_TRIGGERS = false;
debug.ENABLED_WANDER = false;
debug.ENABLED_STATE_CHANGE = false;
debug.ENABLED_RULES = false;
debug.ENABLED_POSTURE_CHANGE = false;
debug.ENABLED_ITEM_CHANGE = false;
debug.ENABLED_FEASIBILITY_CHECK = false;

export { debug };