import type { ISpikeConnection } from "../bluetooth/spike-connection";
import { motorPower, motorStop } from "../protocol/spike-protocol";
import type { Port } from "../protocol/ports";

export class SpikeMotor {
  constructor(private readonly connection: ISpikeConnection, private readonly port: Port) {}

  power(value: number): Promise<void> {
    return this.connection.write(motorPower(this.port, value));
  }

  stop(): Promise<void> {
    return this.connection.write(motorStop(this.port));
  }
}
