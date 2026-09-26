import type { SpikeMessage } from "./messages";
import type { Port } from "./ports";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export type HubInfo = { maxPacketSize: number; maxChunkSize: number };

export const HUB_CONTROLLER = `import hub,motor,runloop,motor_pair
from hub import port,light_matrix,sound
import json
t=hub.config['module_tunnel']
p={'A':port.A,'B':port.B,'C':port.C,'D':port.D,'E':port.E,'F':port.F}
inbox=[]
def send(o):
 try:t.send((json.dumps(o)+'\\n').encode())
 except:pass
async def act(o):
 try:
  c=o.get('cmd')
  q=p.get(o.get('port','').upper())
  if c.startswith('motor.') and q is None:raise ValueError('unknown port')
  if c=='motor.run':motor.run(q,int(o.get('speed',0))*11)
  elif c=='motor.stop':motor.stop(q)
  elif c=='motor.run_for_degrees':await motor.run_for_degrees(q,int(o.get('degrees',0)),int(o.get('speed',0))*11)
  elif c=='motor.run_for_time':await motor.run_for_time(q,int(o.get('ms',0)),int(o.get('speed',0))*11)
  elif c=='motor.run_to_position':await motor.run_to_absolute_position(q,int(o.get('position',0)),int(o.get('speed',0))*11)
  elif c=='motor.reset':motor.reset_relative_position(q,int(o.get('position',0)))
  elif c.startswith('move.'):
   a=p.get(str(o.get('leftPort','A')).upper());b=p.get(str(o.get('rightPort','B')).upper())
   if a is None or b is None:raise ValueError('unknown port')
   motor_pair.pair(motor_pair.PAIR_1,a,b)
   if c=='move.stop':motor_pair.stop(motor_pair.PAIR_1)
   elif c=='move.tank':
    lv=int(o.get('leftSpeed',0))*11;rv=int(o.get('rightSpeed',0))*11
    if lv==0 and rv==0:motor_pair.stop(motor_pair.PAIR_1)
    else:motor_pair.move_tank(motor_pair.PAIR_1,lv,rv)
   elif c=='move.start':
    v=int(o.get('speed',0))*11
    if v==0:motor_pair.stop(motor_pair.PAIR_1)
    else:motor_pair.move(motor_pair.PAIR_1,int(o.get('steering',0)),velocity=v)
   else:raise ValueError('unknown command')
  elif c=='matrix.write':await light_matrix.write(str(o.get('text','')))
  elif c=='matrix.off':light_matrix.clear()
  elif c=='matrix.pixel':light_matrix.set_pixel(int(o.get('x',1))-1,int(o.get('y',1))-1,int(o.get('brightness',100)))
  elif c=='matrix.image':light_matrix.show_image(o.get('image','00000:00000:00000:00000:00000'))
  elif c=='matrix.orientation':light_matrix.set_orientation(int(o.get('orientation',0)))
  elif c=='hub.light':hub.light.color(int(o.get('color',0)))
  elif c=='sound.beep':await sound.beep(int(o.get('frequency',440)),int(float(o.get('seconds',.2))*1000),int(o.get('volume',100)))
  elif c=='sound.stop':sound.stop()
  else:raise ValueError('unknown command')
  send({'event':'ok','id':o.get('id')})
 except Exception as e:send({'event':'error','id':o.get('id'),'message':str(e)})
def on_message(data):
 try:
  if not isinstance(data,str):data=bytes(data).decode('utf-8')
  inbox.append(json.loads(data.strip()))
 except Exception as e:send({'event':'error','message':str(e)})
async def main():
 t.callback(on_message)
 send({'type':'ready'})
 while True:
  if inbox:await act(inbox.pop(0))
  else:await runloop.sleep_ms(10)
runloop.run(main())
`;

export function motorPower(port: Port, power: number): Uint8Array {
  if (!Number.isInteger(power) || power < -100 || power > 100) throw new RangeError("Motor power must be an integer from -100 to 100.");
  return tunnelMessage({ cmd: "motor.run", port, speed: power });
}
export function motorStop(port: Port): Uint8Array { return tunnelMessage({ cmd: "motor.stop", port }); }
export function infoRequest(): Uint8Array { return pack(Uint8Array.of(0x00)); }
export function clearSlot(slot = 0): Uint8Array { return pack(Uint8Array.of(0x46, slot)); }

export function startFileUpload(source: Uint8Array, slot = 0): Uint8Array {
  const filename = encoder.encode("program.py");
  const message = new Uint8Array(38);
  message[0] = 0x0c; message.set(filename, 1); message[1 + filename.length] = 0; message[33] = slot;
  new DataView(message.buffer).setUint32(34, crc32(padToWord(source)), true);
  return pack(message);
}

export function transferChunk(chunk: Uint8Array, runningCrc: number): Uint8Array {
  const message = new Uint8Array(7 + chunk.length);
  message[0] = 0x10;
  const view = new DataView(message.buffer); view.setUint32(1, runningCrc, true); view.setUint16(5, chunk.length, true);
  message.set(chunk, 7); return pack(message);
}
export function startProgram(slot = 0): Uint8Array { return pack(Uint8Array.of(0x1e, 0x00, slot)); }
export function framedDeviceNotificationRequest(intervalMs = 250): Uint8Array {
  const message = new Uint8Array(3); message[0] = 0x28;
  new DataView(message.buffer).setUint16(1, intervalMs, true);
  return pack(message);
}

export function tunnelMessage(payload: object): Uint8Array {
  const body = encoder.encode(JSON.stringify(payload) + "\n");
  const message = new Uint8Array(3 + body.length); message[0] = 0x32;
  new DataView(message.buffer).setUint16(1, body.length, true); message.set(body, 3);
  return pack(message);
}

export function parseHubInfo(message: Uint8Array): HubInfo {
  if (message[0] !== 0x01 || message.length < 17) throw new Error("Invalid InfoResponse from hub.");
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  return { maxPacketSize: view.getUint16(9, true), maxChunkSize: view.getUint16(13, true) };
}

export function unpack(frame: Uint8Array): Uint8Array {
  const start = frame[0] === 0x01 ? 1 : 0;
  let end = frame.length; if (frame[end - 1] === 0x02) end--;
  const unescaped = frame.slice(start, end);
  for (let i = 0; i < unescaped.length; i++) unescaped[i] ^= 0x03;
  return cobsDecode(unescaped);
}
export function pack(data: Uint8Array): Uint8Array {
  const encoded = cobsEncode(data); const frame = new Uint8Array(encoded.length + 1);
  for (let i = 0; i < encoded.length; i++) frame[i] = encoded[i] ^ 0x03;
  frame[frame.length - 1] = 0x02; return frame;
}

export class FrameAssembler {
  private low: number[] = [];
  private high?: number[];
  push(data: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = [];
    for (const byte of data) {
      if (byte === 0x01) { this.high = []; continue; }
      if (byte === 0x02) {
        const target = this.high ?? this.low;
        if (target.length) frames.push(unpack(Uint8Array.from([...target, 0x02])));
        if (this.high) this.high = undefined; else this.low = [];
      } else (this.high ?? this.low).push(byte);
    }
    return frames;
  }
}

export function runningCrc(data: Uint8Array, seed = 0, padFinal = false): number {
  return crc32(padFinal ? padToWord(data) : data, seed);
}
export function sourceBytes(): Uint8Array { return encoder.encode(HUB_CONTROLLER); }
export function decodeMessage(data: Uint8Array): SpikeMessage {
  const raw = data.slice(), messageType = data[0];
  if (messageType === 0x32) return { type: "port-info", port: 0, raw };
  if (messageType === 0x3c) return { type: "port-value", port: data[3] ?? -1, raw };
  return { type: "unknown", messageType, raw };
}

function cobsEncode(data: Uint8Array): Uint8Array {
  const out: number[] = [0xff]; let codeIndex = 0, block = 1;
  for (const byte of data) {
    if (byte > 2) { out.push(byte); block++; }
    if (byte <= 2 || block > 84) {
      if (byte <= 2) out[codeIndex] = byte * 84 + block + 2;
      codeIndex = out.length; out.push(0xff); block = 1;
    }
  }
  out[codeIndex] = block + 2; return Uint8Array.from(out);
}
function cobsDecode(data: Uint8Array): Uint8Array {
  if (!data.length) return new Uint8Array();
  const out: number[] = [];
  const unescape = (code: number): { value?: number; block: number } => {
    if (code === 0xff) return { block: 85 };
    if (code < 3) throw new Error("Invalid COBS frame.");
    let value = Math.floor((code - 2) / 84), block = (code - 2) % 84;
    if (block === 0) { block = 84; value--; }
    return { value, block };
  };
  let { value, block } = unescape(data[0]);
  for (let index = 1; index < data.length; index++) {
    block--;
    if (block > 0) { out.push(data[index]); continue; }
    if (value !== undefined) out.push(value);
    ({ value, block } = unescape(data[index]));
  }
  return Uint8Array.from(out);
}
function padToWord(data: Uint8Array): Uint8Array {
  if (data.length % 4 === 0) return data;
  const padded = new Uint8Array(data.length + 4 - data.length % 4); padded.set(data); return padded;
}
function crc32(data: Uint8Array, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = ((crc >>> 1) ^ (0xedb88320 & -(crc & 1))) >>> 0; }
  return (crc ^ 0xffffffff) >>> 0;
}
