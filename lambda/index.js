const Alexa = require('ask-sdk-core');
const axios = require('axios');

const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getTimestamp() {
  const now = new Date();
  return {
    fecha: now.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
    hora: now.toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit'
    }),
    iso: now.toISOString()
  };
}

async function enviarWebhook(payload) {
  if (!WEBHOOK_URL) {
    console.log('Webhook no configurado. Payload:', JSON.stringify(payload));
    return;
  }
  try {
    await axios.post(WEBHOOK_URL, payload, { timeout: 5000 });
  } catch (error) {
    console.error('Error enviando webhook:', error.message);
  }
}

function getUserId(handlerInput) {
  return handlerInput.requestEnvelope.session.user.userId;
}

function buildWebhookPayload(categoria, accion, extra = {}) {
  return {
    categoria,
    accion,
    ...getTimestamp(),
    ...extra
  };
}

// ─────────────────────────────────────────────
// Launch
// ─────────────────────────────────────────────

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Hola, tracker activo. ¿Qué querés registrar?')
      .reprompt('¿Qué querés registrar?')
      .getResponse();
  }
};

// ─────────────────────────────────────────────
// SUEÑO
// ─────────────────────────────────────────────

const DespertarseIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'DespertarseIntent'
    );
  },
  async handle(handlerInput) {
    const ts = getTimestamp();
    await enviarWebhook(buildWebhookPayload('sueno', 'despertar'));
    return handlerInput.responseBuilder
      .speak(`Buenos días. Registré que te despertaste a las ${ts.hora}.`)
      .getResponse();
  }
};

const DormirseIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'DormirseIntent'
    );
  },
  async handle(handlerInput) {
    const ts = getTimestamp();
    await enviarWebhook(buildWebhookPayload('sueno', 'dormir'));
    return handlerInput.responseBuilder
      .speak(`Buenas noches. Registré que te fuiste a dormir a las ${ts.hora}.`)
      .getResponse();
  }
};

// ─────────────────────────────────────────────
// LECTURA
// ─────────────────────────────────────────────

const IniciarLecturaIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'IniciarLecturaIntent'
    );
  },
  async handle(handlerInput) {
    const ts = getTimestamp();
    await enviarWebhook(buildWebhookPayload('lectura', 'inicio'));
    return handlerInput.responseBuilder
      .speak(`Perfecto. Registré inicio de lectura a las ${ts.hora}. ¡A leer!`)
      .getResponse();
  }
};

const TerminarLecturaIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'TerminarLecturaIntent'
    );
  },
  async handle(handlerInput) {
    const ts = getTimestamp();
    await enviarWebhook(buildWebhookPayload('lectura', 'fin'));
    return handlerInput.responseBuilder
      .speak(`Registré fin de lectura a las ${ts.hora}.`)
      .getResponse();
  }
};

// ─────────────────────────────────────────────
// TRABAJO
// ─────────────────────────────────────────────

const IniciarTrabajoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'IniciarTrabajoIntent'
    );
  },
  async handle(handlerInput) {
    const ts = getTimestamp();
    await enviarWebhook(buildWebhookPayload('trabajo', 'inicio'));
    return handlerInput.responseBuilder
      .speak(`Registré inicio de trabajo a las ${ts.hora}. ¡Éxito!`)
      .getResponse();
  }
};

const PausarTrabajoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'PausarTrabajoIntent'
    );
  },
  async handle(handlerInput) {
    const ts = getTimestamp();
    await enviarWebhook(buildWebhookPayload('trabajo', 'pausa'));
    return handlerInput.responseBuilder
      .speak(`Registré pausa de trabajo a las ${ts.hora}. Descansá.`)
      .getResponse();
  }
};

const ReanudarTrabajoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'ReanudarTrabajoIntent'
    );
  },
  async handle(handlerInput) {
    const ts = getTimestamp();
    await enviarWebhook(buildWebhookPayload('trabajo', 'reanudar'));
    return handlerInput.responseBuilder
      .speak(`Registré vuelta al trabajo a las ${ts.hora}.`)
      .getResponse();
  }
};

// ─────────────────────────────────────────────
// ENTRENAMIENTO
// ─────────────────────────────────────────────

const IniciarEntrenoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'IniciarEntrenoIntent'
    );
  },
  async handle(handlerInput) {
    const ts = getTimestamp();
    await enviarWebhook(buildWebhookPayload('entrenamiento', 'inicio'));
    return handlerInput.responseBuilder
      .speak(`Registré inicio de entrenamiento a las ${ts.hora}. ¡A romperla!`)
      .getResponse();
  }
};

const TerminarEntrenoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'TerminarEntrenoIntent'
    );
  },
  async handle(handlerInput) {
    const ts = getTimestamp();
    await enviarWebhook(buildWebhookPayload('entrenamiento', 'fin'));
    return handlerInput.responseBuilder
      .speak(`Registré fin de entrenamiento a las ${ts.hora}. ¡Muy bien!`)
      .getResponse();
  }
};

// ─────────────────────────────────────────────
// COTIZACIÓN DEL DÓLAR
// ─────────────────────────────────────────────

async function getCotizacion(tipo) {
  const res = await axios.get(`https://dolarapi.com/v1/dolares/${tipo}`, { timeout: 5000 });
  return res.data; // { compra, venta, fechaActualizacion }
}

function formatPesos(numero) {
  return numero.toLocaleString('es-AR');
}

const ConsultarDolarOficialIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarDolarOficialIntent'
    );
  },
  async handle(handlerInput) {
    try {
      const data = await getCotizacion('oficial');
      const speakOutput =
        `El dólar oficial está a $${formatPesos(data.compra)} para la compra ` +
        `y $${formatPesos(data.venta)} para la venta.`;
      return handlerInput.responseBuilder.speak(speakOutput).getResponse();
    } catch (error) {
      console.error('Error consultando dólar oficial:', error.message);
      return handlerInput.responseBuilder
        .speak('No pude obtener la cotización del dólar oficial en este momento. Intentá más tarde.')
        .getResponse();
    }
  }
};

const ConsultarDolarCriptoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConsultarDolarCriptoIntent'
    );
  },
  async handle(handlerInput) {
    try {
      const data = await getCotizacion('cripto');
      const speakOutput =
        `El dólar cripto está a $${formatPesos(data.compra)} para la compra ` +
        `y $${formatPesos(data.venta)} para la venta.`;
      return handlerInput.responseBuilder.speak(speakOutput).getResponse();
    } catch (error) {
      console.error('Error consultando dólar cripto:', error.message);
      return handlerInput.responseBuilder
        .speak('No pude obtener la cotización del dólar cripto en este momento. Intentá más tarde.')
        .getResponse();
    }
  }
};

const ConvertirDolaresIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConvertirDolaresIntent'
    );
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots;
    const monto = parseFloat(slots?.monto?.value);

    if (!monto || isNaN(monto)) {
      return handlerInput.responseBuilder
        .speak('No entendí el monto. ¿Cuántos dólares querés convertir?')
        .reprompt('¿Cuántos dólares?')
        .getResponse();
    }

    try {
      const data = await getCotizacion('oficial');
      const resultado = monto * data.venta;
      const speakOutput =
        `${monto} dólares son $${formatPesos(Math.round(resultado))} pesos ` +
        `al dólar oficial de hoy, que está a $${formatPesos(data.venta)}.`;
      return handlerInput.responseBuilder.speak(speakOutput).getResponse();
    } catch (error) {
      console.error('Error convirtiendo dólares:', error.message);
      return handlerInput.responseBuilder
        .speak('No pude obtener la cotización en este momento. Intentá más tarde.')
        .getResponse();
    }
  }
};

// ─────────────────────────────────────────────
// FINANZAS — Gastos
// ─────────────────────────────────────────────

const RegistrarGastoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'RegistrarGastoIntent'
    );
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots;
    const monto       = slots?.monto?.value;
    const moneda      = slots?.moneda?.value || 'pesos';
    const descripcion = slots?.descripcion?.value || 'sin descripción';

    if (!monto) {
      return handlerInput.responseBuilder
        .speak('No entendí el monto. ¿Cuánto gastaste?')
        .reprompt('¿Cuánto gastaste?')
        .getResponse();
    }

    await enviarWebhook(buildWebhookPayload('finanzas', 'gasto', {
      monto: parseFloat(monto),
      moneda,
      descripcion
    }));

    return handlerInput.responseBuilder
      .speak(`Registré un gasto de ${monto} ${moneda} en ${descripcion}.`)
      .getResponse();
  }
};

// ─────────────────────────────────────────────
// FINANZAS — Ingresos
// ─────────────────────────────────────────────

const RegistrarIngresoIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'RegistrarIngresoIntent'
    );
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots;
    const monto       = slots?.monto?.value;
    const moneda      = slots?.moneda?.value || 'dólares';
    const descripcion = slots?.descripcion?.value || 'cliente';

    if (!monto) {
      return handlerInput.responseBuilder
        .speak('No entendí el monto. ¿Por cuánto fue el ingreso?')
        .reprompt('¿Por cuánto fue el ingreso?')
        .getResponse();
    }

    await enviarWebhook(buildWebhookPayload('finanzas', 'ingreso', {
      monto: parseFloat(monto),
      moneda,
      descripcion
    }));

    return handlerInput.responseBuilder
      .speak(`Registré un ingreso de ${monto} ${moneda} por ${descripcion}. ¡Excelente!`)
      .getResponse();
  }
};

// ─────────────────────────────────────────────
// Built-in intents
// ─────────────────────────────────────────────

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },
  handle(handlerInput) {
    const speakOutput =
      'Podés decirme: me desperté, me voy a dormir, voy a leer, dejé de leer, ' +
      'estoy trabajando, me tomé un descanso, volví a trabajar, ' +
      'me voy a entrenar, volví de entrenar, ' +
      'gasté cincuenta mil pesos en mercadolibre, ' +
      'o conseguí un cliente por cuatrocientos dólares.';

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('¿Qué querés registrar?')
      .getResponse();
  }
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent'
    );
  },
  handle(handlerInput) {
    const speakOutput =
      'No entendí ese comando. Podés decir: me voy a dormir, me desperté, o gasté 200 pesos.';
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('Probá diciendo: me voy a dormir.')
      .getResponse();
  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent' ||
        Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent')
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Hasta luego.')
      .getResponse();
  }
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log('Sesión terminada:', JSON.stringify(handlerInput.requestEnvelope));
    return handlerInput.responseBuilder.getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('Error:', error.message);
    return handlerInput.responseBuilder
      .speak('Hubo un error. Por favor intentá de nuevo.')
      .reprompt('¿Podés repetir?')
      .getResponse();
  }
};

// ─────────────────────────────────────────────
// Skill builder
// ─────────────────────────────────────────────

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    // Sueño
    DespertarseIntentHandler,
    DormirseIntentHandler,
    // Lectura
    IniciarLecturaIntentHandler,
    TerminarLecturaIntentHandler,
    // Trabajo
    IniciarTrabajoIntentHandler,
    PausarTrabajoIntentHandler,
    ReanudarTrabajoIntentHandler,
    // Entrenamiento
    IniciarEntrenoIntentHandler,
    TerminarEntrenoIntentHandler,
    // Cotización dólar
    ConsultarDolarOficialIntentHandler,
    ConsultarDolarCriptoIntentHandler,
    ConvertirDolaresIntentHandler,
    // Finanzas
    RegistrarGastoIntentHandler,
    RegistrarIngresoIntentHandler,
    // Built-in
    HelpIntentHandler,
    FallbackIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withCustomUserAgent('habit-tracker/1.0')
  .lambda();
