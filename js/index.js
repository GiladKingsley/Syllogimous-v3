// Get rid of all the PWA stuff
if ('serviceWorker' in navigator)
    navigator.serviceWorker.getRegistrations()
        .then(registrations => {
            if (registrations.length) for (let r of registrations) r.unregister();
        });

const feedbackWrong = document.querySelector(".feedback--wrong");
const feedbackMissed = document.querySelector(".feedback--missed");
const feedbackRight = document.querySelector(".feedback--right");

const correctlyAnsweredEl = document.querySelector(".correctly-answered");
const nextLevelEl = document.querySelector(".next-level");

const timerInput = document.querySelector("#timer-input");
const timerToggle = document.querySelector("#timer-toggle");
const timerBar = document.querySelector(".timer__bar");
let timerToggled = false;
let timerTime = 30;
let timerCount = 30;
let timerInstance;
let timerRunning = false;
let animatingFeedback = false;

let quota

const historyList = document.getElementById("history-list");
const last30Average = document.getElementById("last-30-average");

let carouselIndex = 0;
let question;
const carousel = document.querySelector(".carousel");
const carouselDisplayLabelType = carousel.querySelector(".carousel_display_label_type");
const carouselDisplayLabelProgress = carousel.querySelector(".carousel_display_label_progress");
const carouselDisplayText = carousel.querySelector(".carousel_display_text");
const carouselBackButton = carousel.querySelector("#carousel-back");
const carouselNextButton = carousel.querySelector("#carousel-next");

const display = document.querySelector(".display-outer");
const displayLabelType = display.querySelector(".display_label_type");
const displayLabelLevel = display.querySelector(".display_label_level");;
const displayText = display.querySelector(".display_text");;

const confirmationButtons = carousel.querySelector(".confirmation-buttons");

const keySettingMapInverse = Object.entries(keySettingMap)
    .reduce((a, b) => (a[b[1]] = b[0], a), {});

carouselBackButton.addEventListener("click", carouselBack);
carouselNextButton.addEventListener("click", carouselNext);

for (const key in keySettingMap) {
    const value = keySettingMap[key];
    const input = document.querySelector("#" + key);

    // Checkbox handler
    if (input.type === "checkbox") {
        input.addEventListener("input", evt => {
            savedata[value] = !!input.checked;
            save();
            init();
        });
    }

    // Number handler
    if (input.type === "number") {
        input.addEventListener("input", evt => {

            // Fix infinite loop on mobile when changing # of premises
            if (input.value === undefined || input.value === null)
                return;
            if (input.min && +input.value < +input.min)
                return;
            if (input.max && +input.value > +input.max)
                return;

            savedata[value] = +input.value;
            save();
            init();
        });
    }
}

// Functions
function save() {
    localStorage.setItem(
        localKey,
        JSON.stringify(savedata)
    );
}

function load() {
    const LSEntry = localStorage.getItem(localKey);

    let savedData;
    if (LSEntry) {
        savedData = JSON.parse(LSEntry);
    }
    if (!savedData) {
        return save();
    }

    Object.assign(savedata, savedData);

    for (let key in savedData) {
        if (!(key in keySettingMapInverse)) continue;
        let value = savedData[key];
        let id = keySettingMapInverse[key];
        
        const input = document.querySelector("#" + id);
        if (input.type === "checkbox")
            input.checked = value;
        else if (input.type === "number")
            input.value = value;
    }

    timerInput.value = savedData.timer;
    timerTime = timerInput.value;

    renderHQL();
}

function carouselInit() {
    carouselIndex = 0;
    confirmationButtons.style.opacity = 0;
    confirmationButtons.style.pointerEvents = "none";
    carouselBackButton.disabled = true;
    carouselNextButton.disabled = false;

    carouselDisplayLabelType.textContent = "Premise";
    carouselDisplayLabelProgress.textContent = "1/" + question.premises.length;
    carouselDisplayText.innerHTML = question.premises[0];
}

function displayInit() {
    displayLabelType.textContent = question.category.split(":")[0];
    displayLabelLevel.textContent = question.premises.length + " ps";
    displayText.innerHTML = [
        ...question.premises.map(p => `<div class="formatted-premise">${p}</div>`),
        '<div class="formatted-conclusion">'+question.conclusion+'</div>'
    ].join('');
}

function carouselBack() {
    carouselIndex--;
    if (carouselIndex < 1)
        carouselBackButton.disabled = true;
    if (carouselIndex < question.premises.length) {
        carouselNextButton.disabled = false;
        confirmationButtons.style.opacity = 0;
    }
    
    carouselDisplayLabelType.textContent = "Premise";
    carouselDisplayLabelProgress.textContent = (carouselIndex + 1) + "/" + question.premises.length;
    carouselDisplayText.innerHTML = question.premises[carouselIndex];
}
  
function carouselNext() {
    carouselIndex++;
    if (carouselIndex > 0)
        carouselBackButton.disabled = false;
    
    // Conclusion appears
    if (carouselIndex === question.premises.length) {
        confirmationButtons.style.pointerEvents = "all";
        carouselDisplayLabelType.textContent = "Conclusion";
        carouselDisplayLabelProgress.textContent = "";
        carouselDisplayText.innerHTML = question.conclusion;
        carouselNextButton.disabled = true;
        confirmationButtons.style.opacity = 1;
        return;
    }
    
    carouselDisplayLabelType.textContent = "Premise";
    carouselDisplayLabelProgress.textContent = (carouselIndex + 1) + "/" + question.premises.length;
    carouselDisplayText.innerHTML = question.premises[carouselIndex];
}

function switchButtons() {
    const parent = document.querySelectorAll(".confirmation-buttons");
    for (let p of parent) {
        const firstChild = p.firstElementChild;
        p.removeChild(firstChild);
        p.appendChild(firstChild);
    }
}

function startCountDown() {
    timerRunning = true;
    question.startedAt = new Date().getTime();
    animateTimerBar();
}

function stopCountDown() {
    timerRunning = false;
    timerCount = timerTime;
    timerBar.style.width = '100%';
    clearTimeout(timerInstance);
}

function animateTimerBar() {
    timerBar.style.width = (timerCount / timerTime * 100) + '%';
    if (timerCount > 0) {
        timerCount--;
        timerInstance = setTimeout(animateTimerBar, 1000);
    }
    else {
        timeElapsed();
    }
}

function timeElapsed() {
    savedata.score--;
    question.answerUser = undefined;
    removeAppStateAndSave();
    renderHQL();

    wowFeedbackMissed(init);
}

function init() {
    stopCountDown();

    const analogyEnable = [
        savedata.enableDistinction,
        savedata.enableComparison,
        savedata.enableTemporal,
        savedata.enableDirection,
        savedata.enableDirection3D,
        savedata.enableDirection4D
    ].reduce((a, c) => a + +c, 0) > 0;

    const binaryEnable = [
        savedata.enableDistinction,
        savedata.enableComparison,
        savedata.enableTemporal,
        savedata.enableDirection,
        savedata.enableDirection3D,
        savedata.enableDirection4D,
        savedata.enableSyllogism
    ].reduce((a, c) => a + +c, 0) > 1;

    const choices = [];
    if (savedata.enableCarouselMode) {
        carousel.classList.add("visible");
        display.classList.remove("visible");
    } else {
        display.classList.add("visible");
        carousel.classList.remove("visible");
    }

    quota = savedata.premises
    quota = Math.min(quota, createQuota())

    if (savedata.enableDistinction && !(savedata.onlyAnalogy || savedata.onlyBinary))
        choices.push(createSameOpposite(quota));
    if (savedata.enableComparison && !(savedata.onlyAnalogy || savedata.onlyBinary))
        choices.push(createMoreLess(quota));
    if (savedata.enableTemporal && !(savedata.onlyAnalogy || savedata.onlyBinary))
        choices.push(createBeforeAfter(quota));
    if (savedata.enableSyllogism && !(savedata.onlyAnalogy || savedata.onlyBinary))
        choices.push(createSyllogism(quota));
    if (savedata.enableDirection && !(savedata.onlyAnalogy || savedata.onlyBinary))
        choices.push(createDirectionQuestion(quota));
    if (savedata.enableDirection3D && !(savedata.onlyAnalogy || savedata.onlyBinary))
        choices.push(createDirectionQuestion3D(quota));
    if (savedata.enableDirection4D && !(savedata.onlyAnalogy || savedata.onlyBinary))
        choices.push(createDirectionQuestion4D(quota));
    if (
        quota > 2
     && savedata.enableAnalogy
     && !savedata.onlyBinary
     && analogyEnable
    ) {
        choices.push(createSameDifferent(quota));
    }
    if (
        quota > 3
     && savedata.enableBinary
     && !savedata.onlyAnalogy
     && binaryEnable
    ) {
        choices.push(createBinaryQuestion(quota));
        choices.push(createNestedBinaryQuestion(quota));
    }

    if (savedata.enableAnalogy && !analogyEnable) {
        alert('ANALOGY needs at least 1 other question class (SYLLOGISM and BINARY do not count).');
        if (savedata.onlyAnalogy)
            return;
    }
    if (savedata.enableAnalogy && analogyEnable && quota < 3) {
        alert('ANALOGY needs at least 3 premises.');
        if (savedata.onlyAnalogy)
            return;
    }


    if (savedata.enableBinary && !binaryEnable) {
        alert('BINARY needs at least 2 other question class (ANALOGY do not count).');
        if (savedata.onlyBinary)
            return;
    }
    if (savedata.enableBinary && binaryEnable && quota < 4) {
        alert('BINARY needs at least 4 premises.');
        if (savedata.onlyBinary)
            return;
    }

    if (choices.length === 0)
        return;

    question = choices[Math.floor(Math.random() * choices.length)];

    if (!savedata.removeNegationExplainer && /is-negated/.test(JSON.stringify(question)))
        question.premises.unshift('<span class="negation-explainer">Invert the <span class="is-negated">Red</span> text</span>');

    // Switch confirmation buttons a random amount of times
    for (let i = Math.floor(Math.random()*10); i > 0; i--) {
        switchButtons();
    }

    if (timerToggled) 
        startCountDown();

    carouselInit();
    displayInit();
}

function wowFeedbackWrong(cb) {
    if (animatingFeedback) {
        return;
    }
    feedbackWrong.style.transitionDuration = "0.5s";
    feedbackWrong.classList.add("active");
    animatingFeedback = true;
    setTimeout(() => {
        feedbackWrong.classList.remove("active");
        cb();
        animatingFeedback = false;
    }, 1200);
}

function wowFeedbackMissed(cb) {
    if (animatingFeedback) {
        return;
    }
    feedbackMissed.style.transitionDuration = "0.5s";
    feedbackMissed.classList.add("active");
    animatingFeedback = true;
    setTimeout(() => {
        feedbackMissed.classList.remove("active");
        cb();
        animatingFeedback = false;
    }, 1200);
}

function wowFeedbackRight(cb) {
    if (animatingFeedback) {
        return;
    }
    feedbackRight.style.transitionDuration = "0.5s";
    feedbackRight.classList.add("active");
    animatingFeedback = true;
    setTimeout(() => {
        feedbackRight.classList.remove("active");
        cb();
        animatingFeedback = false;
    }, 1200);
}

function removeAppStateAndSave() {
    delete question.bucket;
    delete question.buckets;
    delete question.wordCoordMap;
    savedata.questions.push(question);
    save();
}

function checkIfTrue() {
    question.answerUser = true;
    if (question.isValid) {
        savedata.score++;
        wowFeedbackRight(init);
    } else {
        savedata.score--;
        wowFeedbackWrong(init);
    }
    question.answeredAt = new Date().getTime();
    removeAppStateAndSave();
    renderHQL();
}

function checkIfFalse() {
    question.answerUser = false;
    if (!question.isValid) {
        savedata.score++;
        wowFeedbackRight(init);
    } else {
        savedata.score--;
        wowFeedbackWrong(init);
    }
    question.answeredAt = new Date().getTime();
    removeAppStateAndSave();
    renderHQL();
}

function resetApp() {
    const confirmed = confirm("Are you sure?");
    if (confirmed) {
        localStorage.removeItem(localKey);
        window.location.reload();
    }
}

function clearHistory() {
    const confirmed = confirm("Are you sure?");
    if (confirmed) {
        savedata.questions = [];
        savedata.score = 0;
        save();
        window.location.reload();
    }
}

function deleteQuestion(i, isRight) {
    savedata.score += (isRight ? -1 : 1);
    savedata.questions.splice(i, 1);
    save();
    renderHQL();
}

function renderHQL() {
    historyList.innerHTML = "";

    const len = savedata.questions.length;
    const reverseChronological = structuredClone(savedata.questions).reverse();

    reverseChronological
        .map((q, i) => {
            const el = createHQLI(q, len - i - 1);
            return el;
        })
        .forEach(el => historyList.appendChild(el));

    updateAverage(reverseChronological);
    correctlyAnsweredEl.innerText = savedata.score;
    nextLevelEl.innerText = savedata.questions.length;
}

function updateAverage(reverseChronological) {
    const len = Math.min(30, reverseChronological.length)
    const now = new Date().getTime();
    let times = [];
    for (let i = 0; i < len; i++) {
        let q = reverseChronological[i];
        if (q.answeredAt && q.startedAt) {
            const daysSince = (now - q.startedAt) / 86400000 // milliseconds in a day
            if (daysSince < 1) {
                times.push((q.answeredAt - q.startedAt) / 1000);
            }
        }
    }
    if (times.length == 0) {
        last30Average.innerHTML = "None yet"
        return;
    }
    const average = Math.round(times.reduce((a,b) => a + b, 0) / times.length);
    last30Average.innerHTML = average.toFixed(1) + "s";
}

function createHQLI(question, i) {
    const parent = document.createElement("DIV");

    const answerUser = question.answerUser;
    let type = '';
    if (answerUser === undefined) {
        type = 'missed';
    } else if (question.isValid === answerUser) {
        type = 'right'
    } else {
        type = 'wrong'
    }

    let classModifier = {
        'missed': '',
        'right': 'hqli--right',
        'wrong': 'hqli--wrong'
    }[type];
    
    let answerDisplay = {
        'missed': '(TIMED OUT)',
        'right': 'TRUE',
        'wrong': 'FALSE'
    }[type];

    const htmlPremises = question.premises
        .map(p => `<div class="hqli-premise">${p}</div>`)
        .join("\n");

    let responseTimeHtml = '';
    if (question.startedAt && question.answeredAt)
        responseTimeHtml =
`
        <div class="hqli-response-time">${Math.round((question.answeredAt - question.startedAt) / 1000)} sec</div>
`;
    
    const html =
`<div class="hqli ${classModifier}">
    <div class="inner">
        <div class="hqli-premises">
            ${htmlPremises}
        </div>
        <div class="hqli-conclusion">${question.conclusion}</div>
        <div class="hqli-answer-user">${answerDisplay}</div>
        <div class="hqli-answer">${("" + question.isValid).toUpperCase()}</div>
        ${responseTimeHtml}
        <div class="hqli-footer">
            <div>${question.category}</div>
            <div class="index"></div>
            <button class="delete">X</button>
        </div>
    </div>
</div>`;
    parent.innerHTML = html;
    parent.querySelector(".index").textContent = i + 1;
    parent.querySelector(".delete").addEventListener('click', () => {
        deleteQuestion(i, type === 'right');
    });
    return parent.firstElementChild;
}

// Events
timerInput.addEventListener("input", evt => {
    const el = evt.target;
    timerTime = el.value;
    timerCount = el.value;
    el.style.width = (el.value.length + 3) + 'ch';
    savedata.timer = el.value;
    if (timerToggle.checked) {
        stopCountDown();
        startCountDown();
    }
    save();
});

timerToggle.addEventListener("click", evt => {
    timerToggled = evt.target.checked;
    if (timerToggled) startCountDown();
    else stopCountDown();
});

load();
switchButtons();
init();
