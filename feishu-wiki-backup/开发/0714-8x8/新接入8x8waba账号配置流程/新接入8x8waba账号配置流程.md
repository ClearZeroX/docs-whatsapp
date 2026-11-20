# 新接入8x8waba账号配置流程

8x8接入除了常规的waba、phone外还涉及channelId、accountId、subAccountId、appKey等概念，故这里写个配置流程

### 1. 8x8管理后台拿到上述账号信息

accountId 固定为：RupiahCepat

![这张图片展示了8x8管理后台的功能导航栏部分内容，重点突出了Messaging Apps下拉菜单下的Channels选项，该选项被蓝色边框选中高亮。其中有两处红色箭头，上方箭头指向Messaging Apps下拉菜单的展开箭头，下方箭头指向选中的Channels选项，这与文档中提到的“8x8管理后台获取账号信息”的操作场景对应，用于指示在该管理后台中定位Channels选项以进行后续的账号信息获取操作。](_assets/img_LXsCbXWpZo8fHWx4O3fcaJMmnJh.png)

### 2. CRM后台配置

app key 填上面拿到的channelId

![该图片展示的是8x8管理后台的WABA账号相关列表页面，页面的APP Key列被红色方框突出标注，该列内容对应CRM后台配置环节要求填写的内容；列表中呈现了两个WABA账号的信息，其中APP Key分别为7f0bbd57-92ae-46f9-...与3d7477d0-c753-4b05...，归属三方均为EIGHTX8，是新接入8x8waba账号配置流程中，从8x8管理后台获取账号信息环节对应的可视化内容。](_assets/img_P479bA6ovoa7nrxlM9ecbT4inWd.png)

### 3. apollo配置

agent.eightx8.account.mapping配置新增新的账号映射关系

![图片展示了8x8账号映射配置的JSON数据。左侧是部分配置代码，右侧弹出窗口中，以“3d7477d0 - c753 - 4b24 - ab24 - 8ee8efe4e3b”为例，呈现了channelId、accountId和subAccountId等信息。其中，channelId用红色箭头突出显示。该图片与文档中“apollo配置”部分相关，用于说明在apollo配置中agent.eightx8.account.mapping配置新增账号映射关系时，需展示的JSON数据格式及关键信息。](_assets/img_EVqabqxghoFs2mxNHQNcRryfnEc.png)

agent.key.8x8.%s配置： CRM后台配置的waba名称，value固定值

![图片展示的是8x8账号在apollo配置中的agent.key.8x8.%s配置内容。其中，175行和176行分别以红色箭头标识，显示了两个不同的waba名称，分别为“EIGHTX801”和“EIGHTX802”，其后跟有对应的appKey值。该图片与文档中“apollo配置”部分上下文对应，直观呈现了CRM后台配置的waba名称在apollo配置中的具体展示形式。](_assets/img_Du63bYVU2otORHxUQwecg752nef.png)

### 4. 其他apollo常规配置

同其他账号

### 5. 回调配置

8x8管理后台按subAccountId配置回调地址

![这张图片是8x8相关配置涉及的Meta Webhooks设置界面截图，画面左侧为侧边栏菜单，选中了“Messaging APIs”相关选项；中间弹出“Edit webhook”设置窗口，显示该配置的相关信息，包括选中的子账号为RupiahCepat_4，三种回调类型被勾选；画面右侧为Webhooks条目列表，右上角有“Add subscription”按钮，界面多处用红色箭头标注了需要关注的设置位置，该界面对应文档中提到的8x8回调地址配置相关内容。](_assets/img_Km8KbtgFIozURCxg5D6cJIQnnOe.png)

三种type都需要配置，分别为：

- 消息状态变更回调：https://whatsapp-agent-collback.rupiahcepatweb.com/agent/api/eightx8/callback
- 入站消息回调：https://whatsapp-agent-collback.rupiahcepatweb.com/agent/api/eightx8/callback
- 模版账号等信息回调：https://whatsapp-agent-callback-public.rupiahcepatweb.com/agent/api/eightx8/callback

### 6. 测试验证
