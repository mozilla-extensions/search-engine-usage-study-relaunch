/**
 * Starts the Search Engine Usage and Result Quality study.
 * 
 * @module StudyModule
 */

import * as ChoiceArchitectureTreatment from "./ChoiceArchitectureTreatment.js";
import * as AttributionTracking from "./AttributionTracking.js";
import * as InitialCollection from "./InitialCollection.js";
import * as webScience from "@mozilla/web-science";
import * as Utils from "./Utils.js";
import * as Survey from "./Survey.js"
import * as SerpVisitCollection from "./SerpVisitCollection.js"
import * as OnlineServiceVisitCollection from "./OnlineServiceVisitCollection.js"

const millisecondsPerSecond = 1000;
const secondsPerDay = 86400;
const daysUntilTreatment = 10;

/**
 * The set of study conditions and their relative weights.
 * @type {ConditionSet}
 */
const conditionSet = {
  name: "ConditionSelection",
  conditions: [
    { name: "NoTreatment", weight: 10 },
    { name: "NoticeDefault", weight: 20 },
    { name: "NoticeRevert", weight: 20 },
    { name: "ChoiceBallotDefault", weight: 10 },
    { name: "ChoiceBallotHidden", weight: 10 },
    { name: "ChoiceBallotDescriptions", weight: 10 },
    { name: "ChoiceBallotExtended", weight: 20 },
    { name: "ModalPrimaryRevert", weight: 10 },
    { name: "ModalSecondaryRevert", weight: 10 },
    { name: "SelfPreferencedRemoval", weight: 10 },
    { name: "SelfPreferencedReplacement", weight: 10 },
  ]
};

/**
 * Start the Search Engine Usage and Result Quality study
 * @async
 **/
export async function startStudy(): Promise<void> {

  const currentTime = webScience.timing.now();

  /**
   * A persistent key-value storage object for the study
   * @type {Object}
   */
  const storage = await webScience.storage.createKeyValueStorage("WebScience.Studies.SearchEngineUsage");
  await webScience.pageManager.initialize();
  Utils.initializeMatchPatterns();
  AttributionTracking.initializeAttributionTracking();

  const conditionType = await webScience.randomization.selectCondition(conditionSet);

  // Get the start time of the initial survey from storage, which is also the time the study
  // first loaded in participant's browser regardless of if they joined in phase 1 or phase 2.
  // If the value does not exist in storage, then this is the start time of the 
  // initial survey and we set the value in storage.
  let initialSurveyStartTime = await storage.get("InitialSurveyStartTime");
  if (!initialSurveyStartTime) {
    initialSurveyStartTime = currentTime;
    storage.set("InitialSurveyStartTime", initialSurveyStartTime);
  }

  // Get the time that phase 2 started for the participant. We want to know this because
  // we want 10 days of data collection before any treatment, and data collection
  // only begins during the second phase.
  let secondPhaseStartTime: number = await storage.get("SecondPhaseStartTime");
  if (!secondPhaseStartTime) {
    secondPhaseStartTime = webScience.timing.now();
    storage.set("SecondPhaseStartTime", secondPhaseStartTime);
  }

  // Determine the treatment start time. We do not set the treatment start time value in storage here
  // because the calculated value is only the lower bound on when a treatment will start (no treatment
  // can occur if the extension is not running). We actually set the treatment start time value in 
  // ChoiceArchitectureTreatment.ts
  let treatmentStartTime: number = await storage.get("TreatmentStartTime");
  if (!treatmentStartTime) {
    treatmentStartTime = secondPhaseStartTime + (millisecondsPerSecond * secondsPerDay * daysUntilTreatment);
    if (treatmentStartTime <= currentTime) {
      treatmentStartTime = webScience.timing.now();
    }
  }

  SerpVisitCollection.initializeCollection(conditionType, treatmentStartTime, storage);
  OnlineServiceVisitCollection.initializeCollection(storage);
  Survey.initializeSurvey(treatmentStartTime);

  // We pass in the initialSurveyStartTime as the enrollmentTime parameter because this is the same
  // as the enrollment time regardless of if participant joined during v1 or v2 of the study.
  InitialCollection.run(initialSurveyStartTime, conditionType, storage);

  // If current time is before the treatment start time, set timer to start choice architecture treatment
  // functionality at the treatment start time. Otherwise, start treatment functionality now.
  if (currentTime < treatmentStartTime) {
    setTimeout(() => {
      ChoiceArchitectureTreatment.conductTreatment(conditionType, storage);
    }, treatmentStartTime - currentTime);
  } else {
    ChoiceArchitectureTreatment.conductTreatment(conditionType, storage);
  }
}
