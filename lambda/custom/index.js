/* eslint-disable  func-names */
/* eslint-disable  no-console */
/* eslint-disable  no-use-before-define */
const alexa = require('ask-sdk');
const { questionsData, resultsData } = require('./constants');

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speechText = 'Bienvenido al sombrero seleccionador, descubre de que casa eres contestando algunas preguntas para magos, di comenzar para iniciar las preguntas';

    if (!supportsAPL(handlerInput)) {
      return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('Di comenzar para iniciar las preguntas')
      .withSimpleCard('', speechText)
      .getResponse();
    }

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('Di comenzar para iniciar las preguntas')
      .withSimpleCard('', speechText)
      .addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.0',
        document: require('./main.json'),
        datasources: {}
      })
      .getResponse();
  },
};

const StartQuizIntentHandler = {
  canHandle(handlerInput) {
    const { request } = handlerInput.requestEnvelope;

    return request.type === 'IntentRequest'
      && (request.intent.name === 'StartQuizIntent' || request.intent.name === 'AMAZON.StartOverIntent');
  },
  async handle(handlerInput) {
    await handlerInput.attributesManager.setSessionAttributes({
      inProgress: true, questions: questionsData, current: {}, score: {},
    });

    const question = await getRandomQuestion(handlerInput);

    const speechText = `Primera pregunta, ${question.speech}`;

    if (!supportsAPL(handlerInput)) {
      return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard('', speechText)
      .getResponse();
    }

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard('', speechText)
      .addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.0',
        document: require('./question.json'),
        datasources: {
          'data': {
            'header': question.title,
            'answers': question.answers
          }
        }
      })
      .getResponse();
  },
};

const AnswerSelectedIntentHandler = {
  async canHandle(handlerInput) {
    const { request } = handlerInput.requestEnvelope;
    const quizData = await getQuizData(handlerInput);

    return quizData.inProgress
      && (request.type === 'IntentRequest' && request.intent.name === 'AnswerIntent');
  },
  async handle(handlerInput) {
    const response = handlerInput.responseBuilder;
    const answer = handlerInput.requestEnvelope.request.intent.slots.answer.value;
    const quizData = await getQuizData(handlerInput);

    if (quizData.current.answers.length < parseInt(answer, 10)) {
      const speechText = `La respuesta número ${answer} no es valida, las opciones solo llegan hasta el ${quizData.current.answers.length}, si quieres escuchar la pregunta de nuevo di repetir, ¿Que número eliges?`;

      return response
        .speak(speechText)
        .reprompt('Si quieres escuchar la pregunta y respuestas de nuevo di repetir, ¿Que número eliges?')
        .withSimpleCard('Ups!', speechText)
        .getResponse();
    }

    // If its a valid number continue
    saveAnswersScore(answer, handlerInput);

    if (quizData.questions.length) {
      const question = await getRandomQuestion(handlerInput);

      if (!supportsAPL(handlerInput)) {
        return response
          .speak(question.speech)
          .reprompt(question.speech)
          .withSimpleCard('', question.speech)
          .getResponse();
      }

      return response
        .speak(question.speech)
        .reprompt(question.speech)
        .withSimpleCard('', question.speech)
        .addDirective({
          type: 'Alexa.Presentation.APL.RenderDocument',
          version: '1.0',
          document: require('./question.json'),
          datasources: {
            'data': {
              'header': question.title,
              'answers': question.answers
            }
          }
        })
        .getResponse();
    }
    // No more questions, so Results
    const finalData = await getQuizData(handlerInput);
    const finalSpeech = await getFinalResults(finalData.score);

    if (!supportsAPL(handlerInput)) {
      return response.speak(finalSpeech.speech).withShouldEndSession(true).getResponse();
    }

    return response
      .speak(finalSpeech.speech)
      .addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.0',
        document: require('./final.json'),
        datasources: {
          'data': {
            'text': finalSpeech.house
          }
        }
      })
      .withShouldEndSession(true)
      .getResponse();
  },
};

const RepeatIntentHandler = {
  async canHandle(handlerInput) {
    const { request } = handlerInput.requestEnvelope;
    const quizData = await getQuizData(handlerInput);

    return quizData.inProgress && quizData.current && quizData.current.speech
      && (request.type === 'IntentRequest' && request.intent.name === 'AMAZON.RepeatIntent');
  },
  async handle(handlerInput) {
    const sessionAttributes = await handlerInput.attributesManager.getSessionAttributes();
    const { current } = sessionAttributes;

    return handlerInput.responseBuilder
      .speak(current.speech)
      .reprompt(current.speech)
      .withSimpleCard('', current.speech)
      .getResponse();
  },
};

/* HELPERS */
async function getQuizData(handlerInput) {
  const sessionAttributes = await handlerInput.attributesManager.getSessionAttributes();
  return sessionAttributes;
}

const getSessionAttributesHelper = {
  async process(handlerInput) {
    const sessionAttributes = await handlerInput.attributesManager.getSessionAttributes();

    // Check if user is invoking the skill the first time and initialize preset values
    if (Object.keys(sessionAttributes).length === 0) {
      handlerInput.attributesManager.setSessionAttributes({
        inProgress: false, questions: [], current: {}, score: {},
      });
    }
  },
};

async function getRandomQuestion(handlerInput) {
  const quizData = await getQuizData(handlerInput);
  const { questions } = quizData;

  if (questions.length) {
    const index = Math.floor(Math.random() * questions.length);
    const selected = questions[index];

    questions.splice(index, 1);

    const answers = await shuffle(selected.answers);
    const answersArr = answers.map(ans => ans.text)
    const answersList = answers.map((option, idx) => ({ ...option, number: idx + 1 }));
    const answersString = answersList.reduce((acc, curr) => (curr.number === 1 ? ` ${curr.number}) ${curr.text}` : `${acc},  ${curr.number}) ${curr.text}`), '');

    const speech = `${selected.question}, ${answersString}`;

    await handlerInput.attributesManager.setSessionAttributes({
      ...quizData,
      current: { question: selected.question, answers: answersList, speech },
      questions,
    });

    return { speech, title: selected.question, answers: answersArr };
  }
  return 'Lo siento, ya no hay mas preguntas, empieza un juego nuevo';
}

function shuffle(array) {
  const newArray = array;
  let currentIndex = newArray.length;
  let temp;
  let randomIndex;
  // Algorithm : Fisher-Yates shuffle
  return new Promise((resolve) => {
    while (currentIndex >= 1) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;
      temp = newArray[currentIndex];
      newArray[currentIndex] = newArray[randomIndex];
      newArray[randomIndex] = temp;
    }
    resolve(newArray);
  });
}

async function saveAnswersScore(answer, handlerInput) {
  const quizData = await getQuizData(handlerInput);
  const { answers } = quizData.current;

  const matchedOption = answers.find(option => option.number === parseInt(answer, 10));

  quizData.score[matchedOption.value] = quizData.score[matchedOption.value]
    ? quizData.score[matchedOption.value] + 1
    : 1;

  handlerInput.attributesManager.setSessionAttributes({
    ...quizData, score: quizData.score,
  });
}

async function getFinalResults(score) {
  const speechcons = ['abracadabra', 'tilín tilín', 'ámonos', 'bravo', 'chirrín conchín', 'hmm', 'lo veo y no lo creo', 'me lo imaginaba', 'qué envidia'];
  const max = Object.keys(score)
    .reduce((prev, curr) => ((score[prev] > score[curr]) ? prev : curr));

  const selectedHouse = resultsData.find(house => house.value === max);
  return {speech: `<speak><say-as interpret-as="interjection">${speechcons[Math.floor(Math.random() * speechcons.length)]}</say-as>, Tu casa es ${selectedHouse.name}, ${selectedHouse.text}</speak>`, house: selectedHouse.name};
}

function supportsAPL(handlerInput) {
  const supportedInterfaces = handlerInput.requestEnvelope.context.System.device.supportedInterfaces;
  const aplInterface = supportedInterfaces['Alexa.Presentation.APL'];
  return aplInterface != null && aplInterface != undefined;
}

/* BUILT-IN INTENTS */

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speechText = 'Para iniciar un juego di comenzar, para volver a empezar di poner nuevo juego, durante las preguntas debes seleccionar tu respuesta diciendo el numero de la opción que deseas y durante el juego di repetir si deseas escuchar la pregunta nuevamente, ¿Cómo puedo ayudarte?';

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard('Ayuda', speechText)
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent'
        || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const speechText = 'Adios Mago!';

    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('', speechText)
      .withShouldEndSession(true)
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`La sesion termino por: ${handlerInput.requestEnvelope.request.reason}`);

    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);

    return handlerInput.responseBuilder
      .speak('Lo siento, no puedo entenderte por favor repitelo.')
      .reprompt('Lo siento, no puedo entenderte por favor repitelo')
      .getResponse();
  },
};

const skillBuilder = alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    LaunchRequestHandler,
    StartQuizIntentHandler,
    AnswerSelectedIntentHandler,
    RepeatIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler,
  )
  .addRequestInterceptors(getSessionAttributesHelper)
  .addErrorHandlers(ErrorHandler)
  .lambda();
