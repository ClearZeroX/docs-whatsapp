# 0918-印尼服务迁移到aiops

# 资料

[服务端工程创建流程](https://q6oisf77xb.feishu.cn/wiki/wikcnYdwMnHe2sgTAmkOmf5k9oc)

[印尼信贷火山云测试环境中间件](https://q6oisf77xb.feishu.cn/wiki/Nzicw0q98il2C2kCUtvcIRyQngf)

[BytePlus服务器需求](https://q6oisf77xb.feishu.cn/wiki/IUXLwxQTjiq8qfkC27wcvO5mnge)

https://aiops-arch.rupiahcepatweb.com/#/directory/index

aiops地址：https://aiops-arch.rupiahcepatweb.com/?ticket=2698ed5858ed4350851cdf106ecdc34d#/application/2544?tab=logs

# 各种权限申请

1. 配置创建权限
2. 配置编辑权限
3. 提工单申请添加node
4. VPN使用：
5. redis: 王志宗 提供的公共的
   ![图片为一个聊天界面截图，显示了关于印尼服务迁移的讨论。界面中，孙绍凤提到架构工单流程及idn - common - test - dcs的相关信息，包括名称、host、地址、密码、db等，还标注了“@所有人 redis 火山云测试的”。郭小春回复称redis是志宗搭建的公共业务线，mysql需各业务方找海民创建。该图片与文档中印尼服务迁移到aiops的权限申请部分内容相关，展示了部分权限申请信息的交流情况。](_assets/img_DoBVbIAxyoRNYjxfwzfcj7KWnJr.jpg)
6. apollo: 同步配置
   1. 数据不能重新同步- 增量
7. mysql: 找郝海民创建
   1. 数据重新同步
   2. 账号信息：
      ```SQL
        datasource:
          url: jdbc:mysql://10.89.14.141:3306/whatsapp_crm?characterEncoding=UTF8
          username: work_rw
          password:  h4flivVW#Sm129znuHY
          type: com.zaxxer.hikari.HikariDataSource
          driver-class-name: com.mysql.cj.jdbc.Driver
      公网链接：
      IP： 69.5.13.177:3306
      账号密码：同上
      ```
8. mongodb配置：找郝海民创建
   1. 数据重新同步
   2. 账号信息：
      ```SQL
      mongodb:
            uri: mongodb://whatsapp_crm_user:Anzub6f2ReWkHMcR@10.89.14.153:3717,10.89.14.154:3717,10.89.14.155:3717/whatsapp_crm?authSource=whatsapp_crm
      公网链接：
      69.5.12.249：3717，69.5.12.25：3717
      账号密码同上
      ```
   3. DBA给服务器加IP摆白名单
9. rocketmq:
   1. name-server: 10.89.27.105:9876
10. kms-client版本升级
   1. 1.0.10
   2. 私服地址：https://id-c-deploy.rupiahcepatweb.com/#/dashboard 和 https://id-nexus.rupiahcepatweb.com/  是一个，前面的是内网域名
      1. id-nexus/Opay@123qweasd
11. jenkins权限申请：
   1. https://jenkins-arch.rupiahcepatweb.com/loginError    zhalicun/ChangeYourPws123
12. https://id-c-deploy.rupiahcepatweb.com/#/deploy/publish/pod/202693/2578 老华为云平台配置找：王波
13. xxl-job
   1. 权限申请：先申请的公共业务线，备注注明环境地址
      1. 复用原来的：admin sM$y$BU5Np2TRedY
   2. 配置修改xxljob-crm-job namespace:
      1. addresses: https://job-ve-test.rupiahcepatweb.com/xxl-job-admin
   3. xxl-job管理平台对服务器加白
14. rabbitmq
   1. 配置修改
15. 日志打印位置
   1. logging namespace新增：logging.config = classpath:log4j2-aiops.xml
   2. 现在/data/logs/module/下，以前直接在/data/logs/下
16. 申请sso白名单
17. 后端域名申请：whatsapp-crm-api-ve-test.rupiahcepatweb.com
18. 前端代码调整：请求后端域名：指向新的后端域名
19. 前端单独加个配置，实际是指向了特定的机器，申请域名时用里面的IP
    ![图片展示的是一个应用配置界面，处于“Path Forwarding Configuration”标签下。界面中有“Jenkins Address”和“Jenkins Task Name”两个输入框，其中“Jenkins Task Name”框内显示内容为“opay - build - frontend - node16_14_0_ve”。该图片与文档中“前端代码调整”部分内容相关，对应文档中“请求后端域名：指向新的后端域名”步骤，用于说明前端代码调整时，Jenkins Task Name的配置情况。](_assets/img_FSUKbX5N5oNLYxxhtoDcy7h0nAe.png)
20. 前端域名申请：
21. 后端代码配置：需要指向新的前端域名
22. sso为新前端域名添加白名单：否则登录返回
    ```JSON
    {
        "code": "00209",
        "message": "Incorrect redirect URI",
        "data": null
    }
    ```
23. 三方回调域名：
    ```Bash
    GPI:
    https://whatsapp-callback-test.rupiahcepatweb.com/agent/api/gpi/webhook
    NX： 
    https://callback-test.rupiahcepatweb.com/wa/v1/blacklist/nx/callback
    whatsapp-callback-test.rupiahcepatweb.com
    119.28.188.37,43.135.51.46,43.132.175.175,43.154.83.72,8.210.11.198,8.215.198.70,110.239.90.179,47.90.126.195,8.215.193.43,127.0.0.1
    ADA:
    https://whatsapp-callback-test.rupiahcepatweb.com/agent/api/ada/callback
    52.220.0.147,18.139.185.22,13.213.248.157,52.74.255.97,18.139.10.196,108.137.66.114,108.137.137.219,8.215.193.43,8.215.198.58,127.0.0.1
    ycloud:
    https://whatsapp-callback-test.rupiahcepatweb.com/agent/api/ycloud/callback
    8.219.65.77,8.215.193.43,8.215.198.58,127.0.0.1,8.210.11.198,8.215.198.70,110.239.90.179,47.90.126.195
    EIGHTX8:
    https://whatsapp-agent-callback-public-test.rupiahcepatweb.com/agent/api/eightx8/callback
    https://whatsapp-callback-test.rupiahcepatweb.com/agent/api/eightx8/callback
    34.101.157.207,34.101.215.77,34.34.217.244,34.101.109.67,52.220.117.120,52.220.109.9,18.136.13.204,8.215.193.43
    ```
   1. allow 119.28.188.37；allow 43.135.51.46；allow 43.132.175.175；allow 43.154.83.72；allow 8.210.11.198；allow 8.215.198.70；allow 11⑧.239.90.179；allow 47.90.126.195；allow 8.215.193.43；allow 52.220.0.147；allow 18.139.185.22；allow 13.213.248.157：allow 52.74.255.97：allow 18.139.10.196；allow 108.137.66.114；allow 108.137.137.219；allow 8.215.198.58；allow 8.219.65.77：allow 34.101.157.207；allow 34.101.215.77：allow 34.34.217.244；allow 34.101.109.67；allow 52.220.117.120；allow 52.220.109.9；allow 18.136.13.204；allow 34.34.217.244；allow 127.0.0.1；

```JSON
        ada: '["52.220.0.147","18.139.185.22","13.213.248.157","52.74.255.97","18.139.10.196","108.137.66.114","108.137.137.219","8.215.193.43","8.215.198.58","127.0.0.1"]'
        nxcloud: '["119.28.188.37","43.135.51.46","43.132.175.175","43.154.83.72","8.210.11.198",8.215.198.70","110.239.90.179","47.90.126.195","8.215.193.43","127.0.0.1"]'
        ycloud: '["8.219.65.77","8.215.193.43","8.215.198.58","127.0.0.1","8.210.11.198",8.215.198.70","110.239.90.179","47.90.126.195"]'
        vonage: '169.50.200.65-169.50.200.78, 169.63.86.161-169.63.86.174, 119.81.44.1-119.81.44.14, 169.60.146.17-169.60.146.30, 169.50.165.81-169.50.165.94, 5.10.112.113-5.10.112.126, 69.59.247.1-69.59.247.254, 69.59.248.1-69.59.248.254, 69.59.249.1-69.59.249.254, 69.59.250.1-69.59.250.254, 69.59.251.1-69.59.251.254, 216.147.0.1-216.147.63.254, 168.100.64.1-168.100.127.254'
        xeight8: '["34.101.157.207","34.101.215.77","34.34.217.244","34.101.109.67","52.220.117.120","52.220.109.9","18.136.13.204","8.215.193.43"]'
```

```Bash
NX： 
whatsapp-callback-test.rupiahcepatweb.com
119.28.188.37,43.135.51.46,43.132.175.175,43.154.83.72,8.210.11.198,8.215.198.70,110.239.90.179,47.90.126.195,8.215.193.43,127.0.0.1

ADA:
https://whatsapp-callback-test.rupiahcepatweb.com/agent/api/ada/callback
52.220.0.147,18.139.185.22,13.213.248.157,52.74.255.97,18.139.10.196,108.137.66.114,108.137.137.219,8.215.193.43,8.215.198.58,127.0.0.1

ycloud:
https://whatsapp-callback-test.rupiahcepatweb.com/agent/api/ycloud/callback
8.219.65.77,8.215.193.43,8.215.198.58,127.0.0.1,8.210.11.198,8.215.198.70,110.239.90.179,47.90.126.195

EIGHTX8:
https://whatsapp-agent-callback-public-test.rupiahcepatweb.com/agent/api/eightx8/callback
https://whatsapp-callback-test.rupiahcepatweb.com/agent/api/eightx8/callback
34.101.157.207,34.101.215.77,34.34.217.244,34.101.109.67,52.220.117.120,52.220.109.9,18.136.13.204,8.215.193.43
```

收不到回调域名：

```SQL
8x8 - 入站、出站消息
whatsapp-callback-test.rupiahcepatweb.com/agent/api/eightx8/callback 

ada:
模版状态更新了，但是出站消息没回调，入站消息没有收到
whatsapp-callback-test.rupiahcepatweb.com

nx:
模板没回调、入站消息也没有回调
whatsapp-callback-test.rupiahcepatweb.com

gpi: 
请求不通，回调在线上
```

EightX8Callback

yCloudCallback 测试环境无回调，无法测试

adaCallback

nx：nx-crm-test 配置了回调

![这张图片展示了四条印尼服务迁移相关的回调地址配置条目，每条条目由回调地址、回调类型和启用状态三部分组成。四条回调地址均以"https://whatsapp-callback-test.rupiahcepatweb.com"为域名前缀，分别对应waba账号变更回调、模板状态变更回调、发送消息状态回调、消息回复回调，所有回调项的右侧均显示为启用状态，这些内容对应了文档中收不到回调域名的权限申请相关配置。](_assets/img_SLyYbhmQqo8Sk8xr8oEcSjqAnee.png)

6285142679289,6285142679290,6285141301712,6285198488236,6285198488237,6281235214019,6282164022898,6281274703792,6281385723060,6285385339680,6282312799268,6282297626380,6282141337154,6282310500044,6282298759193

15557335720,15557295964,6285119745940,6282118712178,6281313244720

## 测试

updateBasicInfoJob - 启用

1. 新测试环境：
   1. crm后台：https://indonesia-whatapp-crm-ve-test.rupiahcepatweb.com/#/account
   2. 中间件地址：https://aiops-arch.rupiahcepatweb.com/?ticket=76f2d827ad4b46908e549d694624d71c#/application/index

GPI-test

```SQL
worker@hs-id-platform-test-whatsapp-0001:/data/logs$ nslookup messaging.mahadata.io
Server:         100.96.0.2
Address:        100.96.0.2#53

Non-authoritative answer:
Name:   messaging.mahadata.io
Address: 9.154.64.78

worker@hs-id-platform-test-whatsapp-0001:/data/logs$ curl -v --connect-timeout 10 https://messaging.mahadata.io/v1/2315328398944098/templates
* Host messaging.mahadata.io:443 was resolved.
* IPv6: (none)
* IPv4: 9.154.64.78
*   Trying 9.154.64.78:443...
* ipv4 connect timeout after 9984ms, move on!
* Failed to connect to messaging.mahadata.io port 443 after 10002 ms: Timeout was reached
* Closing connection
curl: (28) Failed to connect to messaging.mahadata.io port 443 after 10002 ms: Timeout was reached
```

# 启动参数

## 原参数获取

用的cat /proc/1/cmdline | tr '\\0' ' '这个

```Bash
cat /proc/1/cmdline | tr '\0' ' '
root@idn-center-occ-whatsapp-crm-api-test-7857f968f-z4prx:/data/server/whatsapp-crm# cat /proc/1/cmdline | tr '\0' ' '
java -Xmx512m -Xms512m -XX:MaxMetaspaceSize=256m -XX:MetaspaceSize=128m -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:G1HeapRegionSize=8m -XX:InitiatingHeapOccupancyPercent=45 -XX:G1ReservePercent=15 -XX:SurvivorRatio=8 -XX:MaxTenuringThreshold=15 -XX:+UnlockExperimentalVMOptions -XX:+UseContainerSupport -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/logs -XX:+PrintGCDetails -XX:+PrintGCDateStamps -Xloggc:/data/logs/gc.log -XX:+UseGCLogFileRotation -XX:NumberOfGCLogFiles=5 -XX:GCLogFileSize=20M -Dfile.encoding=UTF-8 -DLog4jContextSelector=org.apache.logging.log4j.core.async.AsyncLoggerContextSelector -Denv=in-rc-test -jar whatsapp-crm-api-1.0-SNAPSHOT.jar root@idn-center-occ-whatsapp-crm-api-test-7857f968f-z4prx:/data/server/whatsapp-crm# 

jcmd 1 VM.flags

-XX:CICompilerCount=2 -XX:CompressedClassSpaceSize=260046848 -XX:ConcGCThreads=1 -XX:G1HeapRegionSize=8388608 -XX:G1ReservePercent=15 -XX:GCLogFileSize=20971520 -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/logs -XX:InitialHeapSize=536870912 -XX:InitiatingHeapOccupancyPercent=45 -XX:MarkStackSize=4194304 -XX:MaxGCPauseMillis=200 -XX:MaxHeapSize=536870912 -XX:MaxMetaspaceSize=268435456 -XX:MaxNewSize=318767104 -XX:MaxTenuringThreshold=15 -XX:MetaspaceSize=134217728 -XX:MinHeapDeltaBytes=8388608 -XX:NumberOfGCLogFiles=5 -XX:+PrintGC -XX:+PrintGCDateStamps -XX:+PrintGCDetails -XX:+PrintGCTimeStamps -XX:SurvivorRatio=8 -XX:+UnlockExperimentalVMOptions -XX:+UseCompressedClassPointers -XX:+UseCompressedOops -XX:+UseContainerSupport -XX:+UseFastUnorderedTimeStamps -XX:+UseG1GC -XX:+UseGCLogFileRotation

jinfo -flags 1
Attaching to process ID 1, please wait...
Error attaching to process: sun.jvm.hotspot.debugger.DebuggerException: Can't attach to the process: ptrace(PTRACE_ATTACH, ..) failed for 1: Operation not permitted
sun.jvm.hotspot.debugger.DebuggerException: sun.jvm.hotspot.debugger.DebuggerException: Can't attach to the process: ptrace(PTRACE_ATTACH, ..) failed for 1: Operation not permitted
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal$LinuxDebuggerLocalWorkerThread.execute(LinuxDebuggerLocal.java:163)
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal.attach(LinuxDebuggerLocal.java:278)
        at sun.jvm.hotspot.HotSpotAgent.attachDebugger(HotSpotAgent.java:671)
        at sun.jvm.hotspot.HotSpotAgent.setupDebuggerLinux(HotSpotAgent.java:611)
        at sun.jvm.hotspot.HotSpotAgent.setupDebugger(HotSpotAgent.java:337)
        at sun.jvm.hotspot.HotSpotAgent.go(HotSpotAgent.java:304)
        at sun.jvm.hotspot.HotSpotAgent.attach(HotSpotAgent.java:140)
        at sun.jvm.hotspot.tools.Tool.start(Tool.java:185)
        at sun.jvm.hotspot.tools.Tool.execute(Tool.java:118)
        at sun.jvm.hotspot.tools.JInfo.main(JInfo.java:138)
        at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
        at sun.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)
        at sun.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
        at java.lang.reflect.Method.invoke(Method.java:498)
        at sun.tools.jinfo.JInfo.runTool(JInfo.java:108)
        at sun.tools.jinfo.JInfo.main(JInfo.java:76)
Caused by: sun.jvm.hotspot.debugger.DebuggerException: Can't attach to the process: ptrace(PTRACE_ATTACH, ..) failed for 1: Operation not permitted
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal.attach0(Native Method)
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal.access$100(LinuxDebuggerLocal.java:62)
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal$1AttachTask.doit(LinuxDebuggerLocal.java:269)
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal$LinuxDebuggerLocalWorkerThread.run(LinuxDebuggerLocal.java:138)

root@idn-center-occ-whatsapp-crm-api-test-7857f968f-z4prx:/data/server/whatsapp-crm# 

jinfo -sysprops 1（看 -D 参数）
root@idn-center-occ-whatsapp-crm-api-test-7857f968f-z4prx:/data/server/whatsapp-crm# jinfo -sysprops 1
Attaching to process ID 1, please wait...
Error attaching to process: sun.jvm.hotspot.debugger.DebuggerException: Can't attach to the process: ptrace(PTRACE_ATTACH, ..) failed for 1: Operation not permitted
sun.jvm.hotspot.debugger.DebuggerException: sun.jvm.hotspot.debugger.DebuggerException: Can't attach to the process: ptrace(PTRACE_ATTACH, ..) failed for 1: Operation not permitted
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal$LinuxDebuggerLocalWorkerThread.execute(LinuxDebuggerLocal.java:163)
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal.attach(LinuxDebuggerLocal.java:278)
        at sun.jvm.hotspot.HotSpotAgent.attachDebugger(HotSpotAgent.java:671)
        at sun.jvm.hotspot.HotSpotAgent.setupDebuggerLinux(HotSpotAgent.java:611)
        at sun.jvm.hotspot.HotSpotAgent.setupDebugger(HotSpotAgent.java:337)
        at sun.jvm.hotspot.HotSpotAgent.go(HotSpotAgent.java:304)
        at sun.jvm.hotspot.HotSpotAgent.attach(HotSpotAgent.java:140)
        at sun.jvm.hotspot.tools.Tool.start(Tool.java:185)
        at sun.jvm.hotspot.tools.Tool.execute(Tool.java:118)
        at sun.jvm.hotspot.tools.JInfo.main(JInfo.java:138)
        at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
        at sun.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)
        at sun.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
        at java.lang.reflect.Method.invoke(Method.java:498)
        at sun.tools.jinfo.JInfo.runTool(JInfo.java:108)
        at sun.tools.jinfo.JInfo.main(JInfo.java:76)
Caused by: sun.jvm.hotspot.debugger.DebuggerException: Can't attach to the process: ptrace(PTRACE_ATTACH, ..) failed for 1: Operation not permitted
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal.attach0(Native Method)
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal.access$100(LinuxDebuggerLocal.java:62)
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal$1AttachTask.doit(LinuxDebuggerLocal.java:269)
        at sun.jvm.hotspot.debugger.linux.LinuxDebuggerLocal$LinuxDebuggerLocalWorkerThread.run(LinuxDebuggerLocal.java:138)

ps -fp 1
root@idn-center-occ-whatsapp-crm-api-test-7857f968f-z4prx:/data/server/whatsapp-crm# ps -fp 1
bash: ps: command not found
```

## 环境参数添加

```SQL
-Dspring.profiles.active=idn-test -Duser.timezone=Asia/Jakarta
```
