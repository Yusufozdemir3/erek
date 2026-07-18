import { registerWebModule, NativeModule } from 'expo';

class CustomNotificationChannelModule extends NativeModule<{}> {}

export default registerWebModule(CustomNotificationChannelModule);
