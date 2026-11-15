# Conectar sensores reales a GeRiAm

Los datos de los equipos llegan por `POST https://<dominio>/api/ingest`.

## 1. Crear la integración

1. Entrar con la cuenta de administrador a Configuración → Integraciones.
2. Crear una integración (ChirpStack, The Things Stack, SCADA o genérica). Se recomienda **exigir firma HMAC**.
3. Copiar el token y el secreto. **Se muestran una sola vez:** GeRiAm guarda solo la huella SHA-256 del token. Si se pierde, se crea otra integración y se desactiva la anterior.

## 2. Pasar los sensores a dato real

En la misma pestaña, en "Fuente de datos de cada sensor":
- elegir LoRaWAN, SCADA o API;
- cargar el **DevEUI** del equipo (16 caracteres hexadecimales).

Desde ese momento el simulador deja de generar ese sensor. Si no llegan datos en 3× su intervalo, se abre la alerta "sensor sin reportar".

## 3. Configurar el emisor

| Sistema | Dónde |
|---|---|
| ChirpStack v4 | Aplicación → Integraciones → HTTP: URL de envío, cabecera `Authorization: Bearer <token>`, codificación JSON |
| The Things Stack v3 | Aplicación → Webhooks → formato JSON, *Uplink message*, cabecera `Authorization` |
| Otro sistema | `{"readings":[{"sensor_code":"CHQ-NIV-01","value":3742.51,"ts":"2026-11-15T12:00:00Z"}]}` (máx. 500 por envío) |

**Valor que se lee del payload decodificado:** se busca, por tipo de sensor, el primer campo que exista:
- `nivel` o `level` (radar y río);
- `lluvia` o `rain`;
- `caudal` o `flow`;
- `presion` o `pressure` (piezómetro);
- `asentamiento` o `settlement`;
- `inclinacion` o `tilt`;
- `value`.

La batería se lee de `battery` o `bateria`.

### Firma HMAC (si está activada)

```
x-geriam-timestamp: <segundos Unix>
x-geriam-signature: hex( HMAC-SHA256( secreto, "<timestamp>.<cuerpo exacto>" ) )
```

Si la hora difiere más de 5 minutos, el envío se rechaza. Así una trama capturada no se puede reenviar.

## 4. Qué hace GeRiAm con cada envío

- **Autenticación:** token válido de una integración activa. Si se desactiva, el token deja de servir al instante.
- **Límites:** 256 KB por envío y 1.200 envíos por minuto por integración.
- **Idempotencia:** la misma trama (DevEUI + contador) en 6 h se ignora.
- **Validación de cada valor:**
  - rango físico del tipo de sensor; por ejemplo, el nivel del embalse debe estar entre la cota de fondo −2 m y la cresta +3 m;
  - fecha entre hace 7 días y 5 minutos en el futuro;
  - un salto brusco se guarda como lectura **dudosa** (calidad 1), no se descarta.
- **Alertas:** se evalúan al instante con el dato nuevo, sin esperar el ciclo de 60 s.
- **Respuesta:** `{ accepted, doubtful, duplicates, rejected: [{ ref, reason }], alertsEvaluated }`.
