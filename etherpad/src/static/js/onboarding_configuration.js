/*
    Configuration for onboarding flow
    Date: 09/03/13
 */

// The width for the container for each step
var WIDTH_PER_STEP = 1000;
// Records the URLs for each step in the flow
var FLOW_STEP_URLS = [
  "/ep/new-site",
  "/ep/new-site/invite"
]
var NUM_LOADED_STEPS = 1;

var multiStepConfig = {
  flowStepUrls: FLOW_STEP_URLS,
  widthPerStep: WIDTH_PER_STEP
}