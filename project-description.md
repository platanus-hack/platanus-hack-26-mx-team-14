# SATI — tu asistente fiscal con IA

**Track: Visualización / Nuevas Interfaces**

## El problema

En México, millones de freelancers y PYMEs tienen que lidiar con el SAT pero no tienen contador. El portal del SAT es lento, confuso y hostil: facturas regadas en pantallas distintas, captchas, una Constancia de Situación Fiscal que nadie entiende, y cálculos de IVA e ISR que dependen de tu régimen. La mayoría termina pagando de más, fuera de tiempo, o simplemente sin saber cuánto debe.

## Qué es SATI

En lugar de pelearte con el portal, **le hablas a SATI**. Un agente con IA entra por ti al **portal real del SAT** (con tu CIEC o e.firma, resolviendo el captcha con visión), baja tus **facturas (CFDIs)** emitidas y recibidas y tu **Constancia de Situación Fiscal**, y calcula tu **IVA e ISR** según tu régimen.

Con esa información, SATI **te arma dashboards a tu medida** y presenta tus datos fiscales de forma clara: cuánto facturaste, cuánto IVA trasladaste vs. acreditaste, cuánto debes este mes, tu próxima obligación. Entiendes tu situación de un vistazo en vez de descifrar el SAT.

## La interfaz: el orbe

El centro de la experiencia es un **orbe holográfico** que te muestra qué está haciendo el agente en cada momento — escuchando, pensando, hablando — **antes de cualquier texto**. Hablas en lenguaje natural ("dame mis facturas de este mes"), el agente entiende, ejecuta la consulta contra el SAT, y el dashboard se construye solo mientras el orbe te explica el resultado en voz.

## Lo técnico

- **Agente que entra al SAT real:** login CIEC / e.firma, captcha resuelto con Claude vision, scraping con Playwright de los portales reales (CFDIs, Constancia) y emisión de facturas CFDI 4.0.
- **Voz de punta a punta:** STT → agente con tool-calling → TTS en streaming, con el orbe reflejando el estado.
- **Dashboard generativo:** la voz y el texto alimentan el mismo lienzo; los paneles se acumulan según lo que preguntas.
- **Seguro por diseño:** las credenciales se cifran con **AES-256** y **nunca entran a un prompt ni a un log**. Demo sobre RFC de prueba.

## Para quién

Freelancers, creativos, repartidores de plataformas y PYMEs que necesitan estar al día con el SAT sin contratar un contador — y entender su situación fiscal sin ser expertos.
