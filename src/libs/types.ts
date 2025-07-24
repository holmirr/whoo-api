export type Route = {
  lat: number;
  lng: number;
}

// speed: km/h, batteryLevel: 0-1, interval: seconds
export type RouteInfo = {
  routes: Route[];
  interval: number;
  batteryLevel: number;
  speed: number;
  expires: string | null;
}

export type UpdateLocationData = {
  "user_location[latitude]": string,
  "user_location[longitude]": string,
  "user_location[speed]": string,
  "user_location[getting_location_type]": string,
  "user_location[horizontal_accuracy]": string,
  "user_location[stayed_at]"?: string,
  "app_state[active]": string,
  "user_battery[level]": string,
  "user_battery[state]": string,
  "user_device[os_info]": string,
  "user_device[os_version]": string,
} 

export interface LocationData {
  locations: Location[];
}

// stayed_atはyyyy-mm-dd hh:mm:ssの形式である(UTC)
export interface Location {
  latitude: string;
  longitude: string;
  stayed_at: string;
  speed: number;
  horizontal_accuracy: string | number;
  battery: Battery;
  device: Device;
  spot: Spot | null;
  user: User;
  sharing_type: number;
  updated_at: string;
  actual_updated_at: string;
}

interface Battery {
  level: number;
  state: number;
}

interface Device {
  os_info: number;
  os_version: string;
}

interface Spot {
  id: number;
  latitude: number;
  longitude: number;
  spot_type: number;
  name: string;
}

interface User {
  id: number;
  uid: number;
  username: string;
  display_name: string;
  profile_image: string;
  introduction: string | null;
  online: boolean;
  user_type: string;
  updated_at: string;
}

type AppIcon = {
  id: number;
  icon_type: string;
  friends_condition: number | null;
  login_days_condition: number | null;
};

type UserAppIcon = {
  id: number;
  app_icon: AppIcon;
  icon_state: "get" | "lock";
  check_conditions: boolean;
};

export type MyInfo = {
  id: number;
  uid: number;
  footprint_uuid: string;
  username: string;
  display_name: string;
  birthday: string;
  profile_image: string;
  introduction: string | null;
  online: boolean;
  login_days: number;
  max_login_days: number;
  private_mode: boolean;
  whoo_supporter: boolean;
  allow_recommended_users: boolean;
  watch_count: number;
  watch_user_count: number;
  phone_number: string | null;
  country_code: string;
  pop_points: number;
  world_rank: number | null;
  friend_count: number;
  time_with: number;
  your_world_disclosure_scope: number;
  created_at: string;
  friend_last_created_at: string;
  user_app_icons: UserAppIcon[];
};

export type MyInfoResponse = {
  user: MyInfo;
  errors: null | any;
};

export type LoginResponseUser = {
  id: number;
  uid: number;
  footprint_uuid: string;
  username: string;
  display_name: string;
  birthday: string;
  profile_image: string;
  introduction: string | null;
  online: boolean;
  private_mode: boolean;
  your_world_disclosure_scope: number;
  user_type: string;
  friend_count: number;
  created_at: string;
};

export type LoginResponse = {
  user: LoginResponseUser;
  access_token: string;
  errors: null | any;
};

export type whooUesr = {
  token: string,
  latitude: number | null,
  longitude: number | null,
  stayed_at: Date | null,
  battery_level: number | null,
  is_no_exec: boolean,
  expires: Date | null,
}