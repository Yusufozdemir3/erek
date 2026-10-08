import { registerWebModule, NativeModule } from 'expo';

class TimerNotificationModule extends NativeModule<{}> {}

export default registerWebModule(TimerNotificationModule, 'TimerNotification');
