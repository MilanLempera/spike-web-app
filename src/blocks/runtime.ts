import type * as Blockly from "blockly";
import type { HubTelemetry, SpikeHub } from "spike-link";

type Log = (message: string, kind?: "info" | "error") => void;

export class BlockRuntime {
  private controller?: AbortController;
  private telemetry?: HubTelemetry;
  private startedAt = 0;
  private movePorts = ["A", "B"];
  private moveSpeed = 50;
  private broadcasts = new Map<string, Blockly.Block[]>();
  private keysDown = new Set<string>();
  private eventState = new Map<string, boolean>();
  private pollTimer?: ReturnType<typeof setInterval>;
  private unsubscribeTelemetry: () => void;
  private volume = 100;
  private wheelDistanceCm = 17.5;
  private activeMotorPorts = new Set<string>();
  private blockErrors = new Map<string,string>();

  constructor(private readonly workspace: Blockly.WorkspaceSvg, private readonly hub: SpikeHub, private readonly log: Log) {
    this.unsubscribeTelemetry = hub.onTelemetry(state => { this.telemetry = state; this.checkHardwareEvents(); });
  }

  get running(): boolean { return !!this.controller && !this.controller.signal.aborted; }

  start(): void {
    this.stop();
    this.clearBlockErrors();
    this.controller = new AbortController();
    this.startedAt = performance.now();
    this.broadcasts.clear();
    this.keysDown.clear(); this.eventState.clear();
    for (const block of this.workspace.getTopBlocks(false)) {
      if (block.type === "spike_event_receive") {
        const name = block.getFieldValue("MESSAGE") || "message1";
        this.broadcasts.set(name, [...(this.broadcasts.get(name) ?? []), block]);
      }
      if (block.type === "spike_event_start") void this.runStack(block.getNextBlock(), this.controller.signal);
    }
    this.pollTimer = setInterval(() => this.checkTimedEvents(), 50);
    this.log("▶ Program started");
  }

  stop(releaseHardware = true): void {
    this.controller?.abort();
    this.controller = undefined;
    if (this.pollTimer) clearInterval(this.pollTimer); this.pollTimer = undefined; this.keysDown.clear();
    if (releaseHardware && this.hub.connected) for (const port of this.activeMotorPorts) void this.hub.sendCommand({cmd:"motor.stop",port}).catch(() => undefined);
    this.activeMotorPorts.clear();
    this.log("■ Program stopped");
  }

  handleKey(code: string, state: "pressed" | "released"): void {
    if (!this.running) return;
    if (state === "pressed") { if (this.keysDown.has(code)) return; this.keysDown.add(code); }
    else { if (!this.keysDown.delete(code)) return; }
    for (const block of this.workspace.getTopBlocks(false)) {
      if (block.type === "spike_event_key" && block.getFieldValue("KEY") === code && block.getFieldValue("STATE") === state) {
        void this.runStack(block.getNextBlock(), this.controller!.signal);
      }
    }
  }

  dispose(): void { this.stop(); this.unsubscribeTelemetry(); }

  private async runStack(first: Blockly.Block | null, signal: AbortSignal): Promise<void> {
    let block = first;
    try {
      while (block && !signal.aborted) {
        await this.execute(block, signal);
        this.clearBlockError(block);
        block = block.getNextBlock();
      }
    } catch (error) { if (!signal.aborted&&block)this.showBlockError(block,error instanceof Error?error.message:String(error)); }
  }

  private async execute(block: Blockly.Block, signal: AbortSignal): Promise<void> {
    const n = (name: string, fallback = 0) => { const result = Number(this.value(block.getInputTargetBlock(name))); return Number.isFinite(result) ? result : fallback; };
    const send = async (command: Record<string, unknown>) => {
      if (!this.hub.connected) { this.log(`Offline · ${JSON.stringify(command)}`); return; }
      await this.hub.sendCommand(command);
      const commandName=String(command.cmd??""),commandPort=typeof command.port==="string"?command.port:undefined;
      if(commandPort&&commandName==="motor.run")this.activeMotorPorts.add(commandPort);
      if(commandPort&&commandName==="motor.stop")this.activeMotorPorts.delete(commandPort);
    };
    const port = block.getFieldValue("PORT") || "A";
    switch (block.type) {
      case "spike_motor_start": await send({cmd:"motor.run",port,speed:block.getFieldValue("DIR")==="ccw"?-50:50}); break;
      case "spike_motor_power_start": await send({cmd:"motor.run",port,speed:n("POWER")}); break;
      case "spike_motor_stop": await send({cmd:"motor.stop",port}); break;
      case "spike_motor_run_for": {
        const amount=n("AMOUNT",1), unit=block.getFieldValue("UNIT");
        const direction=block.getFieldValue("DIR")==="ccw"?-1:1;
        if(unit==="seconds")await send({cmd:"motor.run_for_time",port,ms:amount*1000,speed:50*direction});
        else await send({cmd:"motor.run_for_degrees",port,degrees:(unit==="rotations"?amount*360:amount)*direction,speed:50}); break;
      }
      case "spike_motor_run_to": await send({cmd:"motor.run_to_position",port,position:n("POSITION"),speed:n("SPEED",100)}); break;
      case "spike_motor_set_relative": await send({cmd:"motor.reset",port,position:n("POSITION")}); break;
      case "spike_move_motors": this.movePorts=(block.getFieldValue("PAIR")||"A+B").split("+"); break;
      case "spike_move_wheel": this.wheelDistanceCm=block.getFieldValue("UNIT")==="in"?n("DISTANCE",6.89)*2.54:n("DISTANCE",17.5); break;
      case "spike_move_speed": this.moveSpeed=n("SPEED",50); break;
      case "spike_move_start": await this.drive(block.getFieldValue("DIR")==="backward"?-this.moveSpeed:this.moveSpeed,0); break;
      case "spike_move_steer_start": await this.drive(this.moveSpeed,n("STEERING")); break;
      case "spike_move_tank": await this.tank(n("LEFT"),n("RIGHT")); break;
      case "spike_move_stop": await this.tank(0,0); break;
      case "spike_move_for": case "spike_move_steer_for": {
        const steering=block.type.endsWith("steer_for")?n("STEERING"):0;
        const direction=block.getFieldValue("DIR")==="backward"?-1:1;
        const amount=n("AMOUNT",1), unit=block.getFieldValue("UNIT");
        const rotations=unit==="rotations"?amount:unit==="degrees"?amount/360:unit==="cm"?amount/this.wheelDistanceCm:unit==="in"?(amount*2.54)/this.wheelDistanceCm:0;
        if(unit==="seconds"){await this.drive(this.moveSpeed*direction,steering);await this.delay(amount*1000,signal);await this.tank(0,0);}
        else {const turn=Math.max(-100,Math.min(100,steering));await Promise.all([send({cmd:"motor.run_for_degrees",port:this.movePorts[0],degrees:Math.round(rotations*360*direction*(100+turn)/100),speed:this.moveSpeed}),send({cmd:"motor.run_for_degrees",port:this.movePorts[1],degrees:Math.round(rotations*360*direction*(100-turn)/100),speed:this.moveSpeed})]);} break;
      }
      case "spike_light_matrix": await send({cmd:"matrix.image",image:this.image(block.getFieldValue("IMAGE"))}); break;
      case "spike_light_matrix_for": await send({cmd:"matrix.image",image:this.image(block.getFieldValue("IMAGE"))});await this.delay(n("SECONDS",2)*1000,signal);await send({cmd:"matrix.off"});break;
      case "spike_light_write": await send({cmd:"matrix.write",text:String(this.value(block.getInputTargetBlock("TEXT")))}); break;
      case "spike_light_off": await send({cmd:"matrix.off"}); break;
      case "spike_light_pixel": await send({cmd:"matrix.pixel",x:n("X",1),y:n("Y",1),brightness:n("BRIGHTNESS",100)}); break;
      case "spike_light_orientation": await send({cmd:"matrix.orientation",orientation:{upright:0,right:1,down:2,left:3}[block.getFieldValue("ORIENTATION") as string]??0});break;
      case "spike_light_centre": await send({cmd:"hub.light",color:{black:0,magenta:1,blue:3,green:6,yellow:7,red:9,white:10}[block.getFieldValue("COLOR") as string]??0});break;
      case "spike_sound_beep_for": await send({cmd:"sound.beep",frequency:this.midi(n("NOTE",60)),seconds:n("SECONDS",.2),volume:100}); break;
      case "spike_sound_beep": await send({cmd:"sound.beep",frequency:this.midi(n("NOTE",60)),seconds:1,volume:this.volume}); break;
      case "spike_sound_stop": await send({cmd:"sound.stop"}); break;
      case "spike_sound_set_volume": this.volume=Math.max(0,Math.min(100,n("VALUE",100)));break;
      case "spike_sound_change_volume": this.volume=Math.max(0,Math.min(100,this.volume+n("VALUE")));break;
      case "spike_sensor_timer_reset": this.startedAt=performance.now();break;
      case "spike_control_wait": await this.delay(n("SECONDS",1)*1000,signal); break;
      case "spike_control_repeat": for(let i=0;i<n("TIMES",10)&&!signal.aborted;i++) await this.runStack(block.getInputTargetBlock("DO"),signal); break;
      case "spike_control_forever": while(!signal.aborted){await this.runStack(block.getInputTargetBlock("DO"),signal);await this.delay(0,signal);} break;
      case "spike_control_if": if(this.value(block.getInputTargetBlock("CONDITION"))) await this.runStack(block.getInputTargetBlock("DO"),signal); break;
      case "spike_control_if_else": await this.runStack(block.getInputTargetBlock(this.value(block.getInputTargetBlock("CONDITION"))?"DO":"ELSE"),signal); break;
      case "spike_control_wait_until": while(!this.value(block.getInputTargetBlock("CONDITION"))&&!signal.aborted) await this.delay(25,signal); break;
      case "spike_control_repeat_until": while(!this.value(block.getInputTargetBlock("CONDITION"))&&!signal.aborted) await this.runStack(block.getInputTargetBlock("DO"),signal); break;
      case "spike_control_stop_other": this.log("stop other stacks is limited to newly started event stacks");break;
      case "spike_control_stop": if(block.getFieldValue("WHAT")==="all") this.stop(); else throw new DOMException("Stopped","AbortError"); break;
      case "spike_event_broadcast": case "spike_event_broadcast_wait": {
        const stacks=this.broadcasts.get(block.getFieldValue("MESSAGE")||"message1")??[];
        const jobs=stacks.map(h=>this.runStack(h.getNextBlock(),signal)); if(block.type.endsWith("wait")) await Promise.all(jobs); break;
      }
      default: this.log(`Not yet connected to hardware: ${block.type}`); break;
    }
  }

  private value(block: Blockly.Block | null): unknown {
    if (!block) return 0;
    const v=(name:string)=>this.value(block.getInputTargetBlock(name));
    const a=()=>Number(v("A")), b=()=>Number(v("B"));
    if(block.type==="math_number") return Number(block.getFieldValue("NUM"));
    if(block.type==="text") return block.getFieldValue("TEXT")??"";
    switch(block.type){
      case "spike_operator_random": return Math.floor(Number(v("FROM"))+Math.random()*(Number(v("TO"))-Number(v("FROM"))+1));
      case "spike_operator_add": return a()+b(); case "spike_operator_subtract":return a()-b(); case "spike_operator_multiply":return a()*b(); case "spike_operator_divide":return a()/b();
      case "spike_operator_lt":return a()<b(); case "spike_operator_eq":return v("A")==v("B"); case "spike_operator_gt":return a()>b(); case "spike_operator_and":return Boolean(v("A")&&v("B")); case "spike_operator_or":return Boolean(v("A")||v("B")); case "spike_operator_not":return !v("A");
      case "spike_operator_between":{const x=Number(v("VALUE"));return x>=Number(v("MIN"))&&x<=Number(v("MAX"));} case "spike_operator_join":return String(v("A"))+String(v("B")); case "spike_operator_letter":return String(v("TEXT")).charAt(Number(v("INDEX"))-1); case "spike_operator_length":return String(v("TEXT")).length; case "spike_operator_contains":return String(v("TEXT")).includes(String(v("PART"))); case "spike_operator_mod":return a()%b(); case "spike_operator_round":return Math.round(Number(v("VALUE")));
      case "spike_operator_mathop":{const x=Number(v("VALUE"));switch(block.getFieldValue("OP")){case"abs":return Math.abs(x);case"floor":return Math.floor(x);case"ceil":return Math.ceil(x);case"sqrt":return Math.sqrt(x);case"sin":return Math.sin(x*Math.PI/180);case"cos":return Math.cos(x*Math.PI/180);case"tan":return Math.tan(x*Math.PI/180);case"ln":return Math.log(x);case"log":return Math.log10(x);case"exp":return Math.exp(x);case"pow10":return 10**x;default:return x;}}
      case "spike_sensor_timer":return (performance.now()-this.startedAt)/1000;
      case "spike_motor_position":return this.telemetry?.ports[block.getFieldValue("PORT") as keyof HubTelemetry["ports"]]?.kind==="motor"?(this.telemetry.ports[block.getFieldValue("PORT") as keyof HubTelemetry["ports"]] as {position:number}).position:0;
      case "spike_motor_speed":return this.telemetry?.ports[block.getFieldValue("PORT") as keyof HubTelemetry["ports"]]?.kind==="motor"?(this.telemetry.ports[block.getFieldValue("PORT") as keyof HubTelemetry["ports"]] as {speed:number}).speed:0;
      case "spike_motor_relative":return this.motorState(block)?.position??0;
      case "spike_motor_power":return this.motorState(block)?.power??0;
      case "spike_sensor_colour":{const state=this.portState(block);return state?.kind==="color"?state.color:"Unknown";}
      case "spike_sensor_colour_is":{const state=this.portState(block);return state?.kind==="color"&&state.color.toLowerCase()===String(block.getFieldValue("COLOR")).toLowerCase();}
      case "spike_sensor_reflection":return this.reflectionValue(block);
      case "spike_sensor_reflection_compare":return this.compare(this.reflectionValue(block),Number(v("VALUE")),block.getFieldValue("COMPARE"));
      case "spike_sensor_force_is":{const state=this.portState(block);return state?.kind==="force"&&(block.getFieldValue("STATE")==="pressed"?state.pressed:!state.pressed);}
      case "spike_sensor_pressure":{const state=this.portState(block);return state?.kind==="force"?block.getFieldValue("UNIT")==="N"?state.force/10:state.force:0;}
      case "spike_sensor_distance":return this.distanceValue(block);
      case "spike_sensor_distance_compare":return this.compare(this.distanceValue(block),Number(v("VALUE")),block.getFieldValue("COMPARE"));
      case "spike_sensor_angle":return this.telemetry?.imu?.[block.getFieldValue("ANGLE") as "yaw"|"pitch"|"roll"]??0;
      case "spike_sensor_tilted":return this.tilted(block.getFieldValue("DIR"));
      case "spike_sensor_face":return this.telemetry?.imu?.face.toLowerCase()===String(block.getFieldValue("FACE")).toLowerCase();
      case "spike_sensor_gesture":return this.gesture(block.getFieldValue("GESTURE"));
      case "spike_sound_volume":return this.volume;
      case "spike_sensor_button":return false;
      default:return 0;
    }
  }

  private checkHardwareEvents():void{if(!this.running)return;for(const block of this.workspace.getTopBlocks(false)){let current=false;switch(block.type){case"spike_event_colour":{const state=this.portState(block);current=state?.kind==="color"&&state.color.toLowerCase()===String(block.getFieldValue("COLOR")).toLowerCase();break;}case"spike_event_force":{const state=this.portState(block);current=state?.kind==="force"&&(block.getFieldValue("STATE")==="pressed"?state.pressed:!state.pressed);break;}case"spike_event_distance":current=this.compare(this.distanceValue(block),Number(this.value(block.getInputTargetBlock("DISTANCE"))),block.getFieldValue("COMPARE"));break;case"spike_event_tilted":current=this.tilted(block.getFieldValue("DIR"));break;case"spike_event_face":current=this.telemetry?.imu?.face.toLowerCase()===String(block.getFieldValue("FACE")).toLowerCase();break;case"spike_event_gesture":current=this.gesture(block.getFieldValue("GESTURE"));break;default:continue;}this.triggerOnRise(block,current);}}
  private checkTimedEvents():void{if(!this.running)return;for(const block of this.workspace.getTopBlocks(false)){if(block.type==="spike_event_timer")this.triggerOnRise(block,(performance.now()-this.startedAt)/1000>Number(this.value(block.getInputTargetBlock("SECONDS"))));else if(block.type==="spike_event_condition")this.triggerOnRise(block,Boolean(this.value(block.getInputTargetBlock("CONDITION"))));}}
  private triggerOnRise(block:Blockly.Block,current:boolean):void{const previous=this.eventState.get(block.id)??false;this.eventState.set(block.id,current);if(current&&!previous&&this.controller)void this.runStack(block.getNextBlock(),this.controller.signal);}
  private portState(block:Blockly.Block){return this.telemetry?.ports[block.getFieldValue("PORT") as keyof HubTelemetry["ports"]];}
  private motorState(block:Blockly.Block){const state=this.portState(block);return state?.kind==="motor"?state:undefined;}
  private reflectionValue(block:Blockly.Block):number{const state=this.portState(block);return state?.kind==="color"?Math.round(state.rgb.reduce((sum,x)=>sum+x,0)/30.69):0;}
  private distanceValue(block:Blockly.Block):number{const state=this.portState(block);if(state?.kind!=="distance"||state.distance<0)return -1;const unit=block.getFieldValue("UNIT");return unit==="cm"?state.distance/10:unit==="in"?state.distance/25.4:Math.min(100,state.distance/20);}
  private compare(actual:number,target:number,operator:string):boolean{return operator==="lt"?actual<target:operator==="gt"?actual>target:actual===target;}
  private tilted(direction:string):boolean{const imu=this.telemetry?.imu;if(!imu)return false;return direction==="up"?imu.pitch<-15:direction==="down"?imu.pitch>15:direction==="left"?imu.roll<-15:imu.roll>15;}
  private gesture(gesture:string):boolean{const imu=this.telemetry?.imu;if(!imu)return false;const gyro=Math.hypot(...imu.gyroscope),acc=Math.hypot(...imu.acceleration);return gesture==="shaken"?gyro>800:gesture==="falling"?acc<250:gyro>250;}
  private image(value:string):string{const images:Record<string,string>={"♥":"09090:99999:99999:09990:00900","✓":"00009:00090:90900:09000:00000","✕":"90009:09090:00900:09090:90009"};return images[value]??value??"00000:00000:00000:00000:00000";}

  private async drive(speed:number,steering:number):Promise<void>{const turn=Math.max(-100,Math.min(100,steering));await this.tank(speed*(100+turn)/100,speed*(100-turn)/100);}
  private async tank(left:number,right:number):Promise<void>{const values=[Math.round(left),Math.round(right)];if(this.hub.connected)await Promise.all(this.movePorts.map((port,index)=>this.hub.sendCommand(values[index]===0?{cmd:"motor.stop",port}:{cmd:"motor.run",port,speed:values[index]})));for(const port of this.movePorts){if(left||right)this.activeMotorPorts.add(port);else this.activeMotorPorts.delete(port);}if(!this.hub.connected)this.log(`Offline · drive ${values[0]} / ${values[1]}`);}
  private delay(ms:number,signal:AbortSignal):Promise<void>{return new Promise((resolve,reject)=>{const timer=setTimeout(resolve,Math.max(0,ms));signal.addEventListener("abort",()=>{clearTimeout(timer);reject(new DOMException("Aborted","AbortError"));},{once:true});});}
  private midi(note:number):number{return Math.round(440*Math.pow(2,(note-69)/12));}
  private showBlockError(block:Blockly.Block,message:string):void{if(this.blockErrors.get(block.id)!==message){block.setWarningText(message,"runtime");(block as Blockly.BlockSvg).getSvgRoot?.().classList.add("runtime-error");this.blockErrors.set(block.id,message);}this.log(`⚠ ${block.toString()}: ${message}`,"error");}
  private clearBlockError(block:Blockly.Block):void{if(!this.blockErrors.has(block.id))return;block.setWarningText(null,"runtime");(block as Blockly.BlockSvg).getSvgRoot?.().classList.remove("runtime-error");this.blockErrors.delete(block.id);}
  private clearBlockErrors():void{for(const block of this.workspace.getAllBlocks(false))this.clearBlockError(block);}
}
