'use strict';

const { COLLECTIBLE_MAP, getThemeCollectibles } = require('./theme-collectibles');
const { normalizeThemeId } = require('./themes');

const INITIAL_ITEM_COUNT = 4;
const NEW_ITEM_INTERVAL = 4;
const COLLECTED_TARGET_PREFIX = 'collected:';

function makeItem(themeId, id, name, color, accent, icon, variant) {
  const normalizedVariant = Math.max(0, Math.floor(Number(variant) || 0));
  return Object.freeze({
    id,
    name,
    themeId,
    color,
    accent,
    icon,
    variant: normalizedVariant,
    // 每种物件都有明确价值。正确命中目标才会结算，点错不能刷分刷币。
    pointValue: 18 + normalizedVariant * 3,
    coinValue: 1 + Math.floor(normalizedVariant / 4)
  });
}

const THEME_ITEMS = Object.freeze({
  fruit: Object.freeze([
    makeItem('fruit', 'apple', '苹果', '#F35D62', '#70B95D', 'apple', 0),
    makeItem('fruit', 'strawberry', '草莓', '#F24E72', '#65B96C', 'strawberry', 1),
    makeItem('fruit', 'grapes', '葡萄', '#7865D8', '#68B981', 'grapes', 2),
    makeItem('fruit', 'orange', '橙子', '#F29A43', '#74B95D', 'orange', 3),
    makeItem('fruit', 'pear', '香梨', '#B9D85A', '#65A95A', 'pear', 4),
    makeItem('fruit', 'peach', '蜜桃', '#F58D9B', '#71B66A', 'peach', 5),
    makeItem('fruit', 'lemon', '柠檬', '#F3D74A', '#79B849', 'lemon', 6),
    makeItem('fruit', 'watermelon', '西瓜', '#54B86E', '#F35F70', 'watermelon', 7),
    makeItem('fruit', 'cherry', '樱桃', '#D9435C', '#5CAB62', 'cherry', 8),
    makeItem('fruit', 'banana', '香蕉', '#F2CF4A', '#8CB751', 'banana', 9),
    makeItem('fruit', 'kiwi', '奇异果', '#8E6A47', '#82BC55', 'kiwi', 10),
    makeItem('fruit', 'pineapple', '菠萝', '#EAB544', '#5BA96C', 'pineapple', 11),
    makeItem('fruit', 'mango', '芒果', '#F2B846', '#68A95A', 'fruit', 12),
    makeItem('fruit', 'dragonfruit', '火龙果', '#EE5F83', '#8CCB5B', 'fruit', 13),
    makeItem('fruit', 'blueberry', '蓝莓', '#586FC2', '#91B7E8', 'fruit', 14),
    makeItem('fruit', 'coconut', '椰子', '#9B704F', '#65B8A6', 'fruit', 15),
    makeItem('fruit', 'mangosteen', '山竹', '#8152A4', '#E4A5D2', 'fruit', 16),
    makeItem('fruit', 'papaya', '木瓜', '#E8834E', '#F3C75B', 'fruit', 17),
    makeItem('fruit', 'pomegranate', '石榴', '#D94F62', '#F2A27D', 'fruit', 18),
    makeItem('fruit', 'lychee', '荔枝', '#E98598', '#F7D8C5', 'fruit', 19),
    makeItem('fruit', 'persimmon', '柿子', '#EC8C43', '#78AE5B', 'fruit', 20),
    makeItem('fruit', 'plum', '青李', '#7159A7', '#69B8A5', 'fruit', 21),
    makeItem('fruit', 'starfruit', '杨桃', '#E6B63F', '#F3DB74', 'fruit', 22),
    makeItem('fruit', 'avocado', '牛油果', '#67A85D', '#D2DE6A', 'fruit', 23)
  ]),
  vegetable: Object.freeze([
    makeItem('vegetable', 'vegetable_tomato', '番茄', '#EB5E57', '#63A956', 'vegetable', 0),
    makeItem('vegetable', 'vegetable_carrot', '胡萝卜', '#F08A3E', '#5FA654', 'vegetable', 1),
    makeItem('vegetable', 'vegetable_eggplant', '茄子', '#7956B6', '#68A75D', 'vegetable', 2),
    makeItem('vegetable', 'vegetable_pepper', '甜椒', '#E75C4E', '#57A35B', 'vegetable', 3),
    makeItem('vegetable', 'vegetable_broccoli', '西兰花', '#4F9E58', '#89C56B', 'vegetable', 4),
    makeItem('vegetable', 'vegetable_corn', '玉米', '#F0C64D', '#65A957', 'vegetable', 5),
    makeItem('vegetable', 'vegetable_pumpkin', '南瓜', '#E98A3C', '#5E9E50', 'vegetable', 6),
    makeItem('vegetable', 'vegetable_mushroom', '蘑菇', '#D97E68', '#F3D3B0', 'vegetable', 7),
    makeItem('vegetable', 'vegetable_cucumber', '黄瓜', '#62A957', '#9ED66F', 'vegetable', 8),
    makeItem('vegetable', 'vegetable_cabbage', '卷心菜', '#76B764', '#C4E69B', 'vegetable', 9),
    makeItem('vegetable', 'vegetable_onion', '洋葱', '#B678B8', '#E5B9D9', 'vegetable', 10),
    makeItem('vegetable', 'vegetable_potato', '土豆', '#B78655', '#E1B77F', 'vegetable', 11),
    makeItem('vegetable', 'vegetable_chili', '辣椒', '#E64D45', '#69A853', 'vegetable', 12),
    makeItem('vegetable', 'vegetable_radish', '萝卜', '#ECA0AE', '#74B260', 'vegetable', 13),
    makeItem('vegetable', 'vegetable_lotus', '莲藕', '#C98B70', '#F1C6B0', 'vegetable', 14),
    makeItem('vegetable', 'vegetable_asparagus', '芦笋', '#58A067', '#97CE78', 'vegetable', 15),
    makeItem('vegetable', 'vegetable_pea', '豌豆', '#64AF59', '#B7DF72', 'vegetable', 16),
    makeItem('vegetable', 'vegetable_garlic', '大蒜', '#E7D6C1', '#A58A75', 'vegetable', 17),
    makeItem('vegetable', 'vegetable_beet', '甜菜', '#A94A68', '#7BA75B', 'vegetable', 18),
    makeItem('vegetable', 'vegetable_artichoke', '洋蓟', '#739A67', '#B9CF82', 'vegetable', 19),
    makeItem('vegetable', 'vegetable_yam', '山药', '#B98963', '#E3C5A3', 'vegetable', 20),
    makeItem('vegetable', 'vegetable_bamboo', '竹笋', '#87A95C', '#D9C888', 'vegetable', 21),
    makeItem('vegetable', 'vegetable_gourd', '葫芦', '#82AE55', '#D5D86B', 'vegetable', 22),
    makeItem('vegetable', 'vegetable_lettuce', '生菜', '#6CB35F', '#BEE38E', 'vegetable', 23)
  ]),
  animal: Object.freeze([
    makeItem('animal', 'animal_cat', '小猫', '#D89057', '#FFF0C9', 'animal', 0),
    makeItem('animal', 'animal_dog', '小狗', '#B77A4E', '#F5C68E', 'animal', 1),
    makeItem('animal', 'animal_rabbit', '兔子', '#C9A7DF', '#FFF4FB', 'animal', 2),
    makeItem('animal', 'animal_panda', '熊猫', '#596072', '#F8F8F2', 'animal', 3),
    makeItem('animal', 'animal_fox', '狐狸', '#E77C4E', '#FFE0B1', 'animal', 4),
    makeItem('animal', 'animal_lion', '狮子', '#D8A04D', '#F1C765', 'animal', 5),
    makeItem('animal', 'animal_elephant', '大象', '#7C91AF', '#BFD6E5', 'animal', 6),
    makeItem('animal', 'animal_penguin', '企鹅', '#52627C', '#EAF8FF', 'animal', 7),
    makeItem('animal', 'animal_whale', '鲸鱼', '#56A4D4', '#BCEAFF', 'animal', 8),
    makeItem('animal', 'animal_turtle', '海龟', '#62A96B', '#AAD58B', 'animal', 9),
    makeItem('animal', 'animal_owl', '猫头鹰', '#9B7654', '#F0C76F', 'animal', 10),
    makeItem('animal', 'animal_deer', '小鹿', '#C48758', '#F1D1A6', 'animal', 11),
    makeItem('animal', 'animal_otter', '水獭', '#9A704F', '#E1B98C', 'animal', 12),
    makeItem('animal', 'animal_bear', '棕熊', '#8F674A', '#D9B281', 'animal', 13),
    makeItem('animal', 'animal_tiger', '老虎', '#DE8747', '#4D4A4B', 'animal', 14),
    makeItem('animal', 'animal_peacock', '孔雀', '#4C9F92', '#557AC1', 'animal', 15),
    makeItem('animal', 'animal_alpaca', '羊驼', '#D9B98F', '#FFF0D2', 'animal', 16),
    makeItem('animal', 'animal_octopus', '章鱼', '#B46DB4', '#F1A0C5', 'animal', 17),
    makeItem('animal', 'animal_hedgehog', '刺猬', '#9C7558', '#D7A96F', 'animal', 18),
    makeItem('animal', 'animal_dolphin', '海豚', '#579FC8', '#BCE8F1', 'animal', 19),
    makeItem('animal', 'animal_crane', '白鹤', '#DDE7E7', '#D55661', 'animal', 20),
    makeItem('animal', 'animal_dragon', '幼龙', '#63A77A', '#E7C65A', 'animal', 21),
    makeItem('animal', 'animal_guardian', '守护兽', '#7F6FB4', '#E8C66B', 'animal', 22),
    makeItem('animal', 'animal_squirrel', '松鼠', '#C2764B', '#F0BC75', 'animal', 23)
  ]),
  toy: Object.freeze([
    makeItem('toy', 'toy_bear', '布偶熊', '#C98A58', '#F6C98C', 'toy', 0),
    makeItem('toy', 'toy_robot', '机器人', '#65A9D8', '#F5D56B', 'toy', 1),
    makeItem('toy', 'toy_car', '小汽车', '#EF6E68', '#6FC6C0', 'toy', 2),
    makeItem('toy', 'toy_rocket', '小火箭', '#8A75DB', '#F6C85A', 'toy', 3),
    makeItem('toy', 'toy_blocks', '积木', '#F19B4A', '#66BDAE', 'toy', 4),
    makeItem('toy', 'toy_duck', '小黄鸭', '#F4CF4F', '#EC8A43', 'toy', 5),
    makeItem('toy', 'toy_drum', '小鼓', '#E86472', '#F5D56B', 'toy', 6),
    makeItem('toy', 'toy_kite', '风筝', '#54B8D4', '#EE6F8D', 'toy', 7),
    makeItem('toy', 'toy_train', '小火车', '#5CA77C', '#F1B34D', 'toy', 8),
    makeItem('toy', 'toy_yoyo', '悠悠球', '#8B6CDC', '#67C5B9', 'toy', 9),
    makeItem('toy', 'toy_dino', '小恐龙', '#72B968', '#F2CF5C', 'toy', 10),
    makeItem('toy', 'toy_doll', '布娃娃', '#EA78A6', '#F6D2A1', 'toy', 11),
    makeItem('toy', 'toy_puzzle', '拼图', '#65A7D2', '#F0C95A', 'toy', 12),
    makeItem('toy', 'toy_top', '陀螺', '#E36E68', '#F3C64F', 'toy', 13),
    makeItem('toy', 'toy_plane', '玩具飞机', '#599FD1', '#EAF7FF', 'toy', 14),
    makeItem('toy', 'toy_horse', '木马', '#B77850', '#F0C36C', 'toy', 15),
    makeItem('toy', 'toy_slime', '软泥', '#69B78B', '#D1F5C3', 'toy', 16),
    makeItem('toy', 'toy_capsule', '扭蛋', '#DD6E9B', '#7EC6D1', 'toy', 17),
    makeItem('toy', 'toy_pinwheel', '风车', '#6AAFD1', '#ED7192', 'toy', 18),
    makeItem('toy', 'toy_marble', '弹珠', '#796AD1', '#69C8B8', 'toy', 19),
    makeItem('toy', 'toy_musicbox', '音乐盒', '#B56F9D', '#F0C15C', 'toy', 20),
    makeItem('toy', 'toy_spaceship', '宇宙飞船', '#6A72C4', '#61C0C5', 'toy', 21),
    makeItem('toy', 'toy_castle', '积木城堡', '#E29054', '#7BBBA6', 'toy', 22),
    makeItem('toy', 'toy_chest', '玩具箱', '#B7784F', '#F0C453', 'toy', 23)
  ]),
  dessert: Object.freeze([
    makeItem('dessert', 'dessert_cake', '蛋糕', '#ED7C9D', '#FFF0BE', 'dessert', 0),
    makeItem('dessert', 'dessert_donut', '甜甜圈', '#D98A57', '#F5A9C5', 'dessert', 1),
    makeItem('dessert', 'dessert_cupcake', '纸杯蛋糕', '#C978A4', '#FFE0A8', 'dessert', 2),
    makeItem('dessert', 'dessert_icecream', '冰淇淋', '#78B8D6', '#F7C4D9', 'dessert', 3),
    makeItem('dessert', 'dessert_macaron', '马卡龙', '#8F79D9', '#F2B9CE', 'dessert', 4),
    makeItem('dessert', 'dessert_cookie', '曲奇', '#C78B50', '#6E4934', 'dessert', 5),
    makeItem('dessert', 'dessert_pudding', '布丁', '#E7B84E', '#FFF0A9', 'dessert', 6),
    makeItem('dessert', 'dessert_candy', '糖果', '#D16DD1', '#FFE2FA', 'dessert', 7),
    makeItem('dessert', 'dessert_chocolate', '巧克力', '#82513D', '#C98B5F', 'dessert', 8),
    makeItem('dessert', 'dessert_waffle', '华夫饼', '#D99B54', '#F1C778', 'dessert', 9),
    makeItem('dessert', 'dessert_pie', '水果派', '#D47C58', '#F3C778', 'dessert', 10),
    makeItem('dessert', 'dessert_jelly', '果冻', '#5CB9B0', '#C6FFF1', 'dessert', 11),
    makeItem('dessert', 'dessert_tart', '蛋挞', '#D8944E', '#FFE0A0', 'dessert', 12),
    makeItem('dessert', 'dessert_mousse', '慕斯', '#7CB99A', '#D9F2C8', 'dessert', 13),
    makeItem('dessert', 'dessert_soda', '苏打', '#5FB6C6', '#D3FAF1', 'dessert', 14),
    makeItem('dessert', 'dessert_parfait', '芭菲', '#E27EA6', '#FFF0B1', 'dessert', 15),
    makeItem('dessert', 'dessert_lollipop', '棒棒糖', '#C968C9', '#FFD5F0', 'dessert', 16),
    makeItem('dessert', 'dessert_popcorn', '爆米花', '#E9B64A', '#FFF0BA', 'dessert', 17),
    makeItem('dessert', 'dessert_bread', '甜面包', '#C8874B', '#F3C982', 'dessert', 18),
    makeItem('dessert', 'dessert_tea', '甜茶', '#B7725C', '#F5D4A7', 'dessert', 19),
    makeItem('dessert', 'dessert_house', '糖果屋', '#E36F8C', '#7CC6B7', 'dessert', 20),
    makeItem('dessert', 'dessert_bento', '甜点盒', '#9B78D0', '#F0C765', 'dessert', 21),
    makeItem('dessert', 'dessert_banquet', '甜宴拼盘', '#D87888', '#F0C85F', 'dessert', 22),
    makeItem('dessert', 'dessert_honeycake', '蜂蜜蛋糕', '#D99A4D', '#F7DB75', 'dessert', 23)
  ]),
  appliance: Object.freeze([
    makeItem('appliance', 'appliance_fridge', '冰箱', '#78BCE0', '#EAF7FF', 'appliance', 0),
    makeItem('appliance', 'appliance_washer', '洗衣机', '#77A9D8', '#BCE9F5', 'appliance', 1),
    makeItem('appliance', 'appliance_fan', '电风扇', '#58B9B7', '#E8FFFF', 'appliance', 2),
    makeItem('appliance', 'appliance_kettle', '热水壶', '#EC7A70', '#FFF1D4', 'appliance', 3),
    makeItem('appliance', 'appliance_toaster', '烤面包机', '#E9A65C', '#FFF0C9', 'appliance', 4),
    makeItem('appliance', 'appliance_vacuum', '吸尘器', '#8B73D7', '#D9CEFF', 'appliance', 5),
    makeItem('appliance', 'appliance_lamp', '台灯', '#F0C452', '#FFF7C7', 'appliance', 6),
    makeItem('appliance', 'appliance_cooker', '电饭煲', '#A4B6C9', '#FFF5DC', 'appliance', 7),
    makeItem('appliance', 'appliance_microwave', '微波炉', '#677E9C', '#AEE5EA', 'appliance', 8),
    makeItem('appliance', 'appliance_iron', '熨斗', '#55ACCF', '#E5F8FF', 'appliance', 9),
    makeItem('appliance', 'appliance_dryer', '吹风机', '#E66B88', '#FFD5E2', 'appliance', 10),
    makeItem('appliance', 'appliance_mixer', '搅拌机', '#62B49B', '#E9FFF5', 'appliance', 11),
    makeItem('appliance', 'appliance_humidifier', '加湿器', '#5FB9C6', '#E3FAFF', 'appliance', 12),
    makeItem('appliance', 'appliance_heater', '暖风机', '#E98262', '#FFE7B8', 'appliance', 13),
    makeItem('appliance', 'appliance_scale', '体重秤', '#7C92B6', '#E7F3FF', 'appliance', 14),
    makeItem('appliance', 'appliance_purifier', '净化器', '#5AA9B2', '#E8FFF9', 'appliance', 15),
    makeItem('appliance', 'appliance_coffee', '咖啡机', '#9B6D54', '#E8B873', 'appliance', 16),
    makeItem('appliance', 'appliance_dishwasher', '洗碗机', '#65A9CB', '#E6F7FF', 'appliance', 17),
    makeItem('appliance', 'appliance_oven', '烤箱', '#D88155', '#F5C16A', 'appliance', 18),
    makeItem('appliance', 'appliance_aircon', '空调', '#659FC5', '#EAF8FF', 'appliance', 19),
    makeItem('appliance', 'appliance_hood', '油烟机', '#71849C', '#DCEBF3', 'appliance', 20),
    makeItem('appliance', 'appliance_cleaner', '扫地机', '#6F75C3', '#69C0B5', 'appliance', 21),
    makeItem('appliance', 'appliance_kitchen', '料理台', '#5FAE8E', '#F0C561', 'appliance', 22),
    makeItem('appliance', 'appliance_homecore', '智能音箱', '#8B70C7', '#6DC4C3', 'appliance', 23)
  ]),
  digital: Object.freeze([
    makeItem('digital', 'digital_phone', '手机', '#596B90', '#8ED7E0', 'digital', 0),
    makeItem('digital', 'digital_tablet', '平板', '#69769A', '#C2A8FF', 'digital', 1),
    makeItem('digital', 'digital_laptop', '笔记本', '#58677F', '#7DD3C7', 'digital', 2),
    makeItem('digital', 'digital_headphone', '耳机', '#8B63C9', '#F19AC0', 'digital', 3),
    makeItem('digital', 'digital_camera', '相机', '#58647C', '#8BD0D9', 'digital', 4),
    makeItem('digital', 'digital_console', '掌机', '#EE6C72', '#6FC9B5', 'digital', 5),
    makeItem('digital', 'digital_watch', '手表', '#4D9AB9', '#E7F8FF', 'digital', 6),
    makeItem('digital', 'digital_drone', '无人机', '#7C85A0', '#F4C85A', 'digital', 7),
    makeItem('digital', 'digital_keyboard', '键盘', '#5E6B83', '#A8D7DF', 'digital', 8),
    makeItem('digital', 'digital_mouse', '鼠标', '#8A6DD5', '#D9CFFF', 'digital', 9),
    makeItem('digital', 'digital_projector', '投影仪', '#576A82', '#7BD1C4', 'digital', 10),
    makeItem('digital', 'digital_vr', 'VR眼镜', '#3E506A', '#B28AF1', 'digital', 11),
    makeItem('digital', 'digital_chip', '芯片', '#58688D', '#68C6B7', 'digital', 12),
    makeItem('digital', 'digital_router', '路由器', '#5B8FB7', '#A9E4EC', 'digital', 13),
    makeItem('digital', 'digital_speaker', '音箱', '#765FC1', '#E879A6', 'digital', 14),
    makeItem('digital', 'digital_earbuds', '蓝牙耳机', '#6874A8', '#D6B8F2', 'digital', 15),
    makeItem('digital', 'digital_powerbank', '充电宝', '#4D99A6', '#A8E5D2', 'digital', 16),
    makeItem('digital', 'digital_reader', '阅读器', '#67758C', '#E5C969', 'digital', 17),
    makeItem('digital', 'digital_gamepad', '游戏手柄', '#E36B79', '#67C3B1', 'digital', 18),
    makeItem('digital', 'digital_glasses', '智能眼镜', '#4E6078', '#8CD5DD', 'digital', 19),
    makeItem('digital', 'digital_hologram', '全息台', '#7066C5', '#59C0C8', 'digital', 20),
    makeItem('digital', 'digital_satellite', '卫星', '#687A9D', '#E8C75B', 'digital', 21),
    makeItem('digital', 'digital_aicore', 'AI主机', '#4E5C76', '#B879D7', 'digital', 22),
    makeItem('digital', 'digital_quantum', '量子方块', '#6C59B9', '#5CC8C4', 'digital', 23)
  ]),
  vehicle: Object.freeze([
    makeItem('vehicle', 'vehicle_car', '小轿车', '#E8615D', '#8DD1CF', 'vehicle', 0),
    makeItem('vehicle', 'vehicle_bus', '巴士', '#F0B43F', '#6FA7D0', 'vehicle', 1),
    makeItem('vehicle', 'vehicle_train', '列车', '#5E9E79', '#F4C153', 'vehicle', 2),
    makeItem('vehicle', 'vehicle_plane', '飞机', '#5EA8D2', '#EAF7FF', 'vehicle', 3),
    makeItem('vehicle', 'vehicle_boat', '轮船', '#4D9EC7', '#F0C65B', 'vehicle', 4),
    makeItem('vehicle', 'vehicle_bicycle', '自行车', '#E56D70', '#4C728F', 'vehicle', 5),
    makeItem('vehicle', 'vehicle_rocket', '火箭', '#8B6ED9', '#F2C452', 'vehicle', 6),
    makeItem('vehicle', 'vehicle_scooter', '滑板车', '#5FBBAA', '#E36979', 'vehicle', 7),
    makeItem('vehicle', 'vehicle_truck', '货车', '#E88947', '#5F8FAE', 'vehicle', 8),
    makeItem('vehicle', 'vehicle_submarine', '潜水艇', '#4C9FB0', '#F2CD55', 'vehicle', 9),
    makeItem('vehicle', 'vehicle_helicopter', '直升机', '#657DA7', '#E96B6A', 'vehicle', 10),
    makeItem('vehicle', 'vehicle_taxi', '出租车', '#E7BD45', '#4A5263', 'vehicle', 11),
    makeItem('vehicle', 'vehicle_balloon', '热气球', '#E36E67', '#F2C558', 'vehicle', 12),
    makeItem('vehicle', 'vehicle_metro', '地铁', '#5B8EB8', '#68B99D', 'vehicle', 13),
    makeItem('vehicle', 'vehicle_motorcycle', '摩托车', '#D95E5A', '#4E5D76', 'vehicle', 14),
    makeItem('vehicle', 'vehicle_carriage', '马车', '#A8754F', '#E3B953', 'vehicle', 15),
    makeItem('vehicle', 'vehicle_sailboat', '帆船', '#4F9CBF', '#EAC65A', 'vehicle', 16),
    makeItem('vehicle', 'vehicle_rover', '探测车', '#7C849A', '#E6BA4C', 'vehicle', 17),
    makeItem('vehicle', 'vehicle_ufo', '飞碟', '#7567C8', '#5FC0BC', 'vehicle', 18),
    makeItem('vehicle', 'vehicle_capsulecar', '胶囊车', '#D96E73', '#77BFC2', 'vehicle', 19),
    makeItem('vehicle', 'vehicle_airship', '飞艇', '#6681A8', '#EEC251', 'vehicle', 20),
    makeItem('vehicle', 'vehicle_gateway', '传送门', '#765FCA', '#56C3B9', 'vehicle', 21),
    makeItem('vehicle', 'vehicle_cruiser', '巡航舰', '#536C9A', '#DC6E7F', 'vehicle', 22),
    makeItem('vehicle', 'vehicle_engine', '发动机', '#6E7583', '#E58A49', 'vehicle', 23)
  ]),
  fashion: Object.freeze([
    makeItem('fashion', 'fashion_hat', '帽子', '#B66DD0', '#F5B5D1', 'fashion', 0),
    makeItem('fashion', 'fashion_shirt', '衬衫', '#5DA8D2', '#EAF7FF', 'fashion', 1),
    makeItem('fashion', 'fashion_dress', '连衣裙', '#E66E9B', '#FFD5E8', 'fashion', 2),
    makeItem('fashion', 'fashion_shoe', '潮鞋', '#7667C9', '#F5D16B', 'fashion', 3),
    makeItem('fashion', 'fashion_bag', '手提包', '#C47B50', '#F0B878', 'fashion', 4),
    makeItem('fashion', 'fashion_glasses', '眼镜', '#53627D', '#8CD2DB', 'fashion', 5),
    makeItem('fashion', 'fashion_watch', '腕表', '#4D98B5', '#E7F7FF', 'fashion', 6),
    makeItem('fashion', 'fashion_scarf', '围巾', '#E36C76', '#F7BE94', 'fashion', 7),
    makeItem('fashion', 'fashion_crown', '皇冠', '#E7B640', '#FFF0A6', 'fashion', 8),
    makeItem('fashion', 'fashion_sock', '短袜', '#68B4A7', '#FFF2E8', 'fashion', 9),
    makeItem('fashion', 'fashion_jacket', '外套', '#677D9F', '#AFC9D9', 'fashion', 10),
    makeItem('fashion', 'fashion_umbrella', '雨伞', '#B36ED2', '#F2B4D7', 'fashion', 11),
    makeItem('fashion', 'fashion_necklace', '项链', '#D2A447', '#F3D98B', 'fashion', 12),
    makeItem('fashion', 'fashion_boot', '长靴', '#8C5D63', '#D9A472', 'fashion', 13),
    makeItem('fashion', 'fashion_bow', '蝴蝶结', '#D96591', '#F4B7D1', 'fashion', 14),
    makeItem('fashion', 'fashion_belt', '腰带', '#8B684F', '#E0B167', 'fashion', 15),
    makeItem('fashion', 'fashion_glove', '手套', '#6A9FC4', '#E8F5FF', 'fashion', 16),
    makeItem('fashion', 'fashion_mask', '面具', '#735FB8', '#E6C15C', 'fashion', 17),
    makeItem('fashion', 'fashion_robe', '礼袍', '#A35EC2', '#E977A1', 'fashion', 18),
    makeItem('fashion', 'fashion_suitcase', '手提箱', '#A66E4B', '#DAB16F', 'fashion', 19),
    makeItem('fashion', 'fashion_cape', '披风', '#6B69B7', '#D26E9A', 'fashion', 20),
    makeItem('fashion', 'fashion_outfit', '礼服', '#B55C9B', '#E8BE54', 'fashion', 21),
    makeItem('fashion', 'fashion_wardrobe', '衣橱', '#8B64B0', '#E2A36F', 'fashion', 22),
    makeItem('fashion', 'fashion_brooch', '胸针', '#D0A43F', '#B16AC5', 'fashion', 23)
  ]),
  mascot: Object.freeze([
    makeItem('mascot', 'mascot_mochi', '糯糯', '#F08BA8', '#FFF0DC', 'mascot', 0),
    makeItem('mascot', 'mascot_rabbit', '月芽兔', '#B99AE8', '#FFF6FB', 'mascot', 1),
    makeItem('mascot', 'mascot_cat', '云尾猫', '#7EB9D8', '#FFF3CE', 'mascot', 2),
    makeItem('mascot', 'mascot_fox', '焰耳狐', '#EB845D', '#FFE1B4', 'mascot', 3),
    makeItem('mascot', 'mascot_cloud', '云团仔', '#8DC9D5', '#F8FFFF', 'mascot', 4),
    makeItem('mascot', 'mascot_star', '星星啾', '#F0C653', '#FFF3B3', 'mascot', 5),
    makeItem('mascot', 'mascot_dragon', '极光龙', '#65B49D', '#C8F3E8', 'mascot', 6),
    makeItem('mascot', 'mascot_penguin', '霜帽鹅', '#5A6A8C', '#E9FAFF', 'mascot', 7),
    makeItem('mascot', 'mascot_axolotl', '珍珠六角', '#E88BA7', '#C9F5EE', 'mascot', 8),
    makeItem('mascot', 'mascot_bee', '蜜光蜂', '#E9B943', '#5B4A55', 'mascot', 9),
    makeItem('mascot', 'mascot_mushroom', '梦菇仔', '#C17ECF', '#FFF0F7', 'mascot', 10),
    makeItem('mascot', 'mascot_whale', '潮汐鲸', '#5FA9D8', '#C8F2FF', 'mascot', 11),
    makeItem('mascot', 'mascot_deer', '彗角小鹿', '#C4835A', '#F0C86E', 'mascot', 12),
    makeItem('mascot', 'mascot_ghost', '棱镜幽灵', '#9C79D1', '#E5D5FF', 'mascot', 13),
    makeItem('mascot', 'mascot_turtle', '翡翠小龟', '#68AA6D', '#B9DD8A', 'mascot', 14),
    makeItem('mascot', 'mascot_lion', '雷绒狮', '#D29A49', '#F1CB62', 'mascot', 15),
    makeItem('mascot', 'mascot_bear', '皇冠团熊', '#B37C55', '#F0C66B', 'mascot', 16),
    makeItem('mascot', 'mascot_octopus', '星云章鱼', '#A96DB7', '#E492C4', 'mascot', 17),
    makeItem('mascot', 'mascot_flower', '曦花灵', '#E879A2', '#F1C85B', 'mascot', 18),
    makeItem('mascot', 'mascot_robot', '时针机仔', '#679DBA', '#E1C75A', 'mascot', 19),
    makeItem('mascot', 'mascot_owl', '神谕小鸮', '#967154', '#E8C66A', 'mascot', 20),
    makeItem('mascot', 'mascot_sprite', '火苗精灵', '#E87858', '#F5C452', 'mascot', 21),
    makeItem('mascot', 'mascot_guardian', '星海守护', '#6D79BD', '#65C0AF', 'mascot', 22),
    makeItem('mascot', 'mascot_friend', '岛屿店长', '#D36D9A', '#F0C65A', 'mascot', 23)
  ])
});

// 旧版本关卡与存档可能仍引用这些 ID。它们继续留在 ITEM_MAP 中，
// 但主题生成器不会再把它们混入“奇幻果园”的首阶段。
const LEGACY_ITEMS = Object.freeze([
  makeItem('legacy', 'milk', '牛奶', '#F6FBFF', '#65AEE8', 'milk', 0),
  makeItem('legacy', 'bear', '小熊', '#C88A58', '#7A4C35', 'bear', 0),
  makeItem('legacy', 'bread', '面包', '#E8A85A', '#8C5934', 'bread', 0),
  makeItem('legacy', 'soap', '香皂', '#8DD7D0', '#FFFFFF', 'soap', 0),
  makeItem('legacy', 'juice', '果汁', '#FFAD52', '#F4565A', 'juice', 0),
  makeItem('legacy', 'flower', '鲜花', '#F67FB2', '#FFD45B', 'flower', 0),
  makeItem('legacy', 'shoe', '球鞋', '#7B91EE', '#FFFFFF', 'shoe', 0),
  makeItem('legacy', 'cookie', '曲奇', '#D99A55', '#71452F', 'cookie', 0),
  makeItem('legacy', 'book', '图书', '#6DBE9D', '#FFF2CB', 'book', 0),
  makeItem('legacy', 'mug', '杯子', '#E67676', '#FFF5E8', 'mug', 0),
  makeItem('legacy', 'carrot', '胡萝卜', '#F18C3A', '#68A94A', 'carrot', 0),
  makeItem('legacy', 'candy', '糖果', '#CF78E7', '#FDE8FF', 'candy', 0),
  makeItem('legacy', 'camera', '相机', '#58647C', '#8BD0D9', 'camera', 0),
  makeItem('legacy', 'ball', '皮球', '#56B8E6', '#FFF2D0', 'ball', 0),
  makeItem('legacy', 'plant', '盆栽', '#65B76D', '#D88A52', 'plant', 0),
  makeItem('legacy', 'gift', '礼物', '#F1768C', '#FFE06A', 'gift', 0)
]);

const ITEMS = Object.freeze(Object.keys(THEME_ITEMS)
  .reduce((all, themeId) => all.concat(THEME_ITEMS[themeId]), [])
  .concat(LEGACY_ITEMS));

const ITEM_MAP = ITEMS.reduce((map, item) => {
  map[item.id] = item;
  return map;
}, {});

function getThemeItems(themeId) {
  return THEME_ITEMS[normalizeThemeId(themeId)] || THEME_ITEMS.fruit;
}

function getUnlockedItems(level, themeId) {
  const themeItems = getThemeItems(themeId);
  const count = Math.min(
    themeItems.length,
    INITIAL_ITEM_COUNT + Math.floor((Math.max(1, level) - 1) / NEW_ITEM_INTERVAL)
  );
  return themeItems.slice(0, count);
}

function getNewlyUnlockedItem(level, themeId) {
  const currentLevel = Math.max(1, Math.floor(Number(level) || 1));
  if (currentLevel <= 1) return null;
  const previous = getUnlockedItems(currentLevel - 1, themeId);
  const current = getUnlockedItems(currentLevel, themeId);
  return current.length > previous.length ? current[current.length - 1] : null;
}

function createCollectedTargetItemId(collectibleId) {
  return `${COLLECTED_TARGET_PREFIX}${collectibleId}`;
}

function isCollectedTargetItemId(itemId) {
  return typeof itemId === 'string' && itemId.indexOf(COLLECTED_TARGET_PREFIX) === 0;
}

function getCollectedTargetCollectible(itemId) {
  if (!isCollectedTargetItemId(itemId)) return null;
  return COLLECTIBLE_MAP[itemId.slice(COLLECTED_TARGET_PREFIX.length)] || null;
}

const COLLECTED_TARGET_CACHE = {};

function getCollectedTargetItem(collectibleOrId) {
  const collectible = typeof collectibleOrId === 'string'
    ? (COLLECTIBLE_MAP[collectibleOrId] || getCollectedTargetCollectible(collectibleOrId))
    : collectibleOrId;
  if (!collectible) return null;
  if (COLLECTED_TARGET_CACHE[collectible.id]) return COLLECTED_TARGET_CACHE[collectible.id];
  const rarityBonus = { rare: 0, epic: 8, legendary: 18, mythic: 32 }[collectible.rarity] || 0;
  const item = Object.freeze({
    id: createCollectedTargetItemId(collectible.id),
    name: collectible.name,
    themeId: collectible.themeId,
    color: collectible.color,
    accent: collectible.accent,
    icon: 'collected_target',
    variant: collectible.variant || 0,
    pointValue: 34 + rarityBonus,
    coinValue: 2 + Math.floor(rarityBonus / 12),
    collectibleId: collectible.id,
    collectible
  });
  COLLECTED_TARGET_CACHE[collectible.id] = item;
  return item;
}

function getCollectedTargetCandidates(themeId, collection, level) {
  const normalizedThemeId = normalizeThemeId(themeId);
  const data = collection || {};
  const currentLevel = Math.max(1, Math.floor(Number(level) || 1));
  return getThemeCollectibles(normalizedThemeId)
    .filter((collectible) => {
      const entry = data[collectible.id];
      return collectible.minLevel <= currentLevel && entry && Number(entry.count) > 0;
    })
    .map(getCollectedTargetItem);
}

function getItemById(itemId) {
  return ITEM_MAP[itemId] || getCollectedTargetItem(itemId);
}

module.exports = {
  COLLECTED_TARGET_PREFIX,
  INITIAL_ITEM_COUNT,
  ITEMS,
  ITEM_MAP,
  LEGACY_ITEMS,
  NEW_ITEM_INTERVAL,
  THEME_ITEMS,
  createCollectedTargetItemId,
  getCollectedTargetCandidates,
  getCollectedTargetCollectible,
  getCollectedTargetItem,
  getItemById,
  getNewlyUnlockedItem,
  getThemeItems,
  getUnlockedItems,
  isCollectedTargetItemId
};
