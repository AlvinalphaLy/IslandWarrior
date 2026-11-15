import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent, voice } from '@livekit/agents';
import { realtime } from '@livekit/agents-plugin-openai';
import { runAgent } from './chert-rooms.mjs';
import { greetOnBridgeReady } from './greet.mjs';

// Change these instructions to build your own agent. Keep replies conversational.
const instructions = `You are the Oracle, an AI voice guide for IslandWarrior, an Odyssey-inspired browser game.
Keep replies to one or two short sentences, warm and clear. Say you are an AI when introducing yourself.
Current documented controls: WASD or arrows move; E, Space or Enter interacts and advances dialogue;
C cycles skins; M toggles map overview; F1 toggles collision debugging. Touch controls are available.
The game has village, cave, dungeon and a battle scene. Your teammate is still developing gameplay.
The planned journey is Ithaca, training with Telemachus, Kalos's shop, a dragon lair, and a weekly reward.
Training rewards, purchases, equipment and dragon mechanics are planned until verified in the game.
You cannot see the caller's screen, game state or video, change equipment, award coins, or perform actions.
Never claim otherwise. If asked about live HP or progress, explain that game-state hooks are not connected.
Chert carries the call, Tiger Data will store run events and recaps, and Vultr will host the game and API.
Do not invent controls or promise that planned features already work. Ask what the caller wants help with.`;
const greeting =
  'Say: I am the Oracle, your AI IslandWarrior guide. Would you like help with the controls or the planned adventure?';

const agent = defineAgent({
  entry: async (ctx) => {
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    // Chert prepares a room before a caller exists. Join promptly so Chert can
    // find us, but wait before opening a paid model session. Doctor jobs may end
    // without a caller ever joining.
    const caller = await ctx.waitForParticipant();
    const session = new voice.AgentSession({
      llm: new realtime.RealtimeModel({ model: 'gpt-realtime', voice: 'marin' }),
    });
    ctx.addShutdownCallback(() => session.close());
    await session.start({
      room: ctx.room,
      agent: new voice.Agent({ instructions }),
      record: false,
      inputOptions: {
        participantIdentity: caller.identity,
        audioEnabled: true,
        videoEnabled: false,
        textEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false },
    });
    // Greet once when chert dev reports that FaceTime is ready (bridge_ready in the
    // room metadata): the Mac ends the call if it hears nothing within 10 seconds
    // of that. Participant arrival alone is not readiness, so there is no greeting
    // on it. Without the signal there is no greeting, and the caller speaks first.
    const stopGreeting = greetOnBridgeReady(ctx.room, () =>
      session.generateReply({ instructions: greeting }),
    );
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

export default agent;

// Your own LiveKit project when .env.local has its three LIVEKIT_ values; otherwise Chert rooms through chert dev.
if (process.argv.includes('--help')) {
  console.log(
    'Configure .env.local with your own LiveKit project and OPENAI_API_KEY. Run npm start; then Chert dev in a second terminal. See README.md.',
  );
} else
  runAgent(agent, {
    file: fileURLToPath(import.meta.url),
    agentName: process.env.AGENT_NAME || 'islandwarrior-oracle',
  });
