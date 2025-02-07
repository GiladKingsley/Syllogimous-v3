const TYPE_TO_OVERRIDES = {
    "distinction"  : [ "overrideDistinctionPremises", "overrideDistinctionTime" ],
    "comparison"   : [ "overrideComparisonPremises" , "overrideComparisonTime" ],
    "temporal"     : [ "overrideTemporalPremises"   , "overrideTemporalTime" ],
    "syllogism"    : [ "overrideSyllogismPremises"  , "overrideSyllogismTime" ],
    "binary"       : [ "overrideBinaryPremises"     , "overrideBinaryTime" ],
    "space-two-d"  : [ "overrideDirectionPremises"  , "overrideDirectionTime" ],
    "space-three-d": [ "overrideDirection3DPremises", "overrideDirection3DTime" ],
    "space-time"   : [ "overrideDirection4DPremises", "overrideDirection4DTime" ],
};

const COMMON_TYPES = [
    ["comparison", "temporal", "distinction", "syllogism"],
]

const COMMON_TYPES_TABLE = COMMON_TYPES.reduce((acc, types) => {
    for (let i = 0; i < types.length; i++) {
        for (let j = i+1; j < types.length; j++) {
            acc[types[i]] = acc[types[i]] || [types[i]];
            acc[types[j]] = acc[types[j]] || [types[j]];
            acc[types[i]].push(types[j]);
            acc[types[j]].push(types[i]);
        }
    }
    return acc;
}, {});


const progressTracker = document.getElementById("progress-tracker");

class ProgressStore {
    calculateKey(question) {
        return this.calculateKeyFromCustomType(question, question.type);
    }

    calculateKeyFromCustomType(question, type) {
        let plen = question.premises;
        let countdown = question.countdown;
        let key = `${type}-${plen}-${countdown}`;
        if (question.modifiers && question.modifiers.length !== 0) {
            key += `-${question.modifiers.join('-')}`
        }
        return key;
    }

    calculateCommonKeys(question) {
        const types = COMMON_TYPES_TABLE[question.type] || [question.type];
        types.sort();
        return types.map(type => this.calculateKeyFromCustomType(question, type));
    }

    convertForDatabase(question) {
        const q = {...question};
        q.timestamp = q.answeredAt;
        q.timeElapsed = q.answeredAt - q.startedAt;
        q.premises = q.plen || q.premises.length;
        q.countdown = q.tlen || q.countdown || savedata.timer;
        q.key = this.calculateKey(q);
        delete q.plen;
        delete q.startedAt;
        delete q.answeredAt;
        delete q.wordCoordMap;
        delete q.bucket;
        delete q.buckets;
        delete q.operations;
        delete q.conclusion;
        delete q.isValid;
        delete q.answerUser;
        delete q.category;
        delete q.subresults;
        delete q.tlen;
        return q;
    }

    async storeCompletedQuestion(question) {
        const q = this.convertForDatabase(question);
        if (savedata.autoProgression) {
            await this.determineLevelChange(q);
        }
        await storeProgressData(q);
    }

    success(q, trailingProgress, successes, type) {
        const [overridePremiseSetting, overrideTimerSetting] = TYPE_TO_OVERRIDES[type];
        const minUpgrade = q.countdown - 1;
        const left = successes[successes.length - 3].timeElapsed / 1000;
        const right = successes[successes.length - 2].timeElapsed / 1000;
        const percentile90ish = Math.floor((left + right) / 2) + 1;
        const newTimerValue = Math.min(minUpgrade, percentile90ish);
        const averageTime = successes.map(s => s.timeElapsed / 1000).reduce((a, b) => a + b) / successes.length;
        if (averageTime <= savedata.autoProgressionGoal || newTimerValue <= savedata.autoProgressionGoal) {
            savedata[overridePremiseSetting] = q.premises + 1;
            savedata[overrideTimerSetting] = savedata.autoProgressionGoal + 20;
        } else {
            savedata[overrideTimerSetting] = newTimerValue;
        }
    }

    fail(q, trailingProgress, successes, type) {
        const ratio = successes.length / trailingProgress.length;
        const [overridePremiseSetting, overrideTimerSetting] = TYPE_TO_OVERRIDES[type];
        const newTimerValue = q.countdown + (ratio <= 0.5 ? 10 : 5);
        if (newTimerValue > savedata.autoProgressionGoal + 25) {
            if (q.premises > 2) {
                savedata[overridePremiseSetting] = q.premises - 1;
                savedata[overrideTimerSetting] = savedata.autoProgressionGoal + 20;
            } else {
                savedata[overrideTimerSetting] = Math.min(newTimerValue, 60);
            }
        } else {
            savedata[overrideTimerSetting] = newTimerValue;
        }
    }

    async determineLevelChange(q) {
        let trailingProgress = await getTopRRTProgress(this.calculateCommonKeys(q), 19);
        trailingProgress.push(q);
        trailingProgress.sort((a, b) => a.timeElapsed - b.timeElapsed);
        const successes = trailingProgress.filter(p => p.correctness === 'right');
        const commonTypes = COMMON_TYPES_TABLE[q.type] || [q.type];
        if (trailingProgress.length < 20) {
            const numFailures = trailingProgress.length - successes.length;
            if (numFailures >= 7) {
                for (const type of commonTypes) {
                    this.fail(q, trailingProgress, successes, type);
                }
                q.didTriggerProgress = true;
            }
            return;
        }
        for (const type of commonTypes) {
            if (18 <= successes.length) {
                this.success(q, trailingProgress, successes, type);
                q.didTriggerProgress = true;
            } else if (14 <= successes.length) {
                continue;
            } else {
                this.fail(q, trailingProgress, successes, type);
                q.didTriggerProgress = true;
            }
        }
        populateSettings();
    }

    async renderCurrentProgress(question) {
        const q = this.convertForDatabase(question);
        let trailingProgress = await getTopRRTProgress(this.calculateCommonKeys(q), 20);
        progressTracker.innerHTML = '';
        if (!savedata.autoProgression) {
            progressTracker.classList.remove('visible');
            return;
        } 
        progressTracker.classList.add('visible');
        trailingProgress.forEach(q => {
            const isSuccess = q.correctness === 'right';
            const span = document.createElement('span');
            span.classList.add('trailing-dot');
            span.classList.add(isSuccess ? 'success' : 'fail');
            progressTracker.appendChild(span);
        });
    }

}

const PROGRESS_STORE = new ProgressStore();
