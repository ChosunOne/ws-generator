// A class that wraps a `WebSocket` to allow you to `await` on messages.
// Useful for blocking until a message is received, and continuing to listen
// afterward.
import {Data, WebSocket} from "ws";

export default class WebSocketGenerator {
    private receivedMessages: Data[] = [];
    private receivedErrors: Error[] = [];
    private waitMessage: Promise<void>;
    private waitMessageResolve?: () => void;
    private waitError: Promise<Error>;
    private waitErrorResolve?: (value: Error | PromiseLike<Error>) => void;
    private generator: AsyncGenerator<Data | undefined, void>;
    private closed = false;
    constructor(private readonly client: WebSocket) {
        this.generator = this.messages();
        this.waitMessage = new Promise<void>((resolve) => {
            this.waitMessageResolve = resolve;
        });
        this.waitError = new Promise<Error>((resolve) => {
            this.waitErrorResolve = resolve;
        });

        this.client.on("message", (data: Data) => {
            this.receivedMessages.push(data);
            if(!this.waitMessageResolve) {
                throw new Error("waitMessageResolve is undefined");
            }
            this.waitMessageResolve();
            this.waitMessage = new Promise<void>((resolve) => {
                this.waitMessageResolve = resolve;
            });
        });

        this.client.on("error", (error) => {
            this.receivedErrors.push(error);
            if(!this.waitErrorResolve) {
                throw new Error("waitErrorResolve is undefined");
            }
            this.waitError = new Promise<Error>((resolve) => {
                this.waitErrorResolve = resolve;
            });
        });

        this.client.on("close", () => {
            this.closed = true;
        });
    }

    public async * messages() {
        while (!this.closed) {
            if (this.receivedMessages.length > 0) {
                yield this.receivedMessages.shift();
                continue;
            }
            await this.waitMessage;
        }
    }

    public async nextMessage<T>(): Promise<T> {
        const message = await this.generator.next();
        if (message.done) {
            throw new Error("No more messages");
        }
        if (!message.value) {
            throw new Error("No message");
        }
        return JSON.parse(message.value.toString());
    }

    public async * errors() {
        while (!this.closed) {
            if (this.receivedErrors.length > 0) {
                yield this.receivedErrors.shift();
                continue;
            }
            await this.waitError;
        }
    }

    public async nextError() {
        const error = await this.errors().next();
        if (error.done) {
            throw new Error("No more errors");
        }
        return error.value;
    }
}
