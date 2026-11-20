# todo-lto

1. AI备用素材模板，LTO类型模板无法支持AI备用素材模板，因为LTO模板必须是MARKETING类型
   1. 去掉LTO组合 - done
2. 同步的组合也有问题 - done
   1. 包含LTO的组合也被同步了
3. LTO区域 预览效果
   **〔分栏 1，宽度约 25%〕**
   ![该图片展示了印尼金融服务平台RupiahCepat的借贷服务宣传内容，顶部标注了平台名称RupiahCepat及相关标识，核心信息为最高额度2亿印尼盾，可享30天免利息，且具备流程便捷、放款快速、受OJK监管的特点。图片下方展示了平台提供的优惠信息，含将于当日19:23结束的优惠代码AAACCC，附带相关宣传文案，提及资金最快15秒到账，还有“Salin kode tawaran”（复制优惠代码）及“click”的操作选项。](_assets/img_ICAKbYaRjomzejx4Kfgcktdonvc.png)
   **〔分栏 2，宽度约 27%〕**
   ![图片展示的是RupiahCepat的广告界面。上方有“Limit Maksimal 200 JUTA!”等宣传语，显示最高可获得200万额度，30天内免息。中间有“buy 2 get 1 free”优惠信息。下方文字介绍快速贷款，称在RupiahCepat可获得最高200万额度，验证简单、流程简便，15秒内到账。右上角有“click”按钮。该图片与文档中LTO区域预览效果的上下文相关，展示了LTO广告的实际样式。](_assets/img_Do0Hbb2gCoekD6xJr9EcrLsvnmh.png)
   **〔分栏 3，宽度约 25%〕**
   ![图片展示的是一个金融广告界面。上方有“RupiahCepat”和“affi”标志，宣传“Limit Maksimal 200 JUTA!”，并称可在30天内获得30天免费使用。下方有“Proses Mudah”“Cair Cepat”“Teregulasi OJK”等标签。中间是手机展示界面，显示“buy 2 get 1 free”优惠信息，代码为“AAACCC”，还强调“Dana cair cuma 15 detik!”等。底部有“阅读更多”“Salin kode tawaran”“CLICK”按钮。该图与文档中介绍的金融广告相关，可能是展示广告内容。](_assets/img_MYbzbbJwSoJxkCxChNtcdzJjndh.png)
   **〔分栏 4，宽度约 24%〕**
   ![图片展示的是RupiahCepat的广告内容。上方有“Limit Maksimal 200 JUTA!”等宣传语，配以“Dapatkan GRATIS bunga 30 Hari”等优惠信息。中间是手机界面展示，下方有“Proses Mudah”“Cair Cepat”“Teregulasi OJK”等标识。底部有“buy 2 get 1 free”优惠信息，代码为“AAACCC”，还说明“Dana cair cuma 15 detik! Kesempatan dapat limit hingga 200 juta di RupiahCepat! Verifikasi mudah, proses simpel, dana langsung cair pas kam...”。图片与上下文可能是在讨论相关广告素材或优惠信息。](_assets/img_FwCybyGjgofTDTxOnneceNoCn9c.png)
   1. 绝对、相对两种模式, 下面第4张实际我设置的是25号4点
4. 创建-素材模板-复制优惠码按钮没有被复制到备用素材模板
   1. 复制了，是因为ADA不支持，页面做了特殊限制不展示
   2.

- 普通模板创建校验foot
   - 有foot时怎么不要LTO区域：不输入优惠文案即可

- 验证没有head是否可以创建LTO类型成功
   - 创建、发送成功

- 按钮校验: todo
   - 设置过期
      - 必须同时有【复制优惠码】、【访问网址】按钮，且顺序固定优惠码第一位，访问网址第二位
         - NX: message: Required Buttons Missing, URL is required at index 1 when Limited Time Offer is present
   - 不设置过期
      - 必须有按钮：访问网址按钮是必须的，复制优惠码按钮非必须，没有复制优惠码按钮时，访问网址按钮要放在第一位；有复制优惠码按钮时，复制优惠码按钮必须第一位，访问网址按钮必须第二位
         - 只有访问网址按钮：优惠码区域显示的是URL内容：zlc_0909_no_expire_3
           ![这张图片展示了LTO类型内容创建后的页面示例，上方区域标有“coupon”，附带一条包含链接的优惠相关内容，链接地址为https://connect.8x8.com/login?mid=cvst&fbclid=IwAR6ywCZlmGDUQ5bNIJ37AJCtzhcxWhl4hHldBmnP_aaFqcwy6KFYoroV2BvaQ_wapm_kFFr2ssKSFCLbaf840eVsw_waaem_K87Sil0Mk1ej2Wc8wHQinQ，下方对应区域标注为“body”，还有一个输入框内显示“click”，该内容对应文档中“只有访问网址按钮，优惠码区域显示URL内容”的验证场景。](_assets/img_AWTMbrzSRoPuyjxSOzEcaHE8nse.png)
         - 只有优惠码按钮（不行）：Required Buttons Missing, URL is required at index 1 when Limited Time Offer is present
         - 有优惠码、访问网址按钮，显示区域无倒计时：zlc_0909_no_expire_4
           ![该图片展示了有限时间促销（LTO）类型的内容界面，其中优惠券代码为AAA，区域内包含两个按钮，上方按钮标注为“Copy offer code”，对应复制优惠码，下方按钮标注为“click”，对应访问网址。结合上下文的校验规则可知，该界面属于无过期设置的LTO模板，因同时存在优惠码按钮和访问网址按钮，符合“复制优惠码按钮第一位、访问网址按钮第二位”的固定顺序要求，且未设置过期，无倒计时显示，属于符合规则的正确展示状态。](_assets/img_K0BebQp1WozkioxMrbfcr2aontf.png)
   - 其他按钮类型？
      - 设置过期：zlc_0910_test_button4   实测加电话排在第三位没有问题
      - 不设置过期：zlc_0910_test_button3   实测加电话排在第三位没有问题

- 普通模板-创建非营销类型
   - 回归正常

- 不支持的通道，会显示创建失败的模板
  ![这张图片展示的是模板管理页面的内容，表格中列出了多个模板的相关信息，包含模板ID、模板名称、模板类型、曾经是Utility的情况、模板分类、WABA名称、素材模板ID以及模板状态等列。这些模板的模板分类均为MARKETING，模板类型都是普通模板，曾经是Utility这一属性均为“否”，WABA名称涉及eightx8、ycloud_open、gdiTest001、NX11、ADA56等不同内容，素材模板ID统一为528，模板状态包含CREATEFAIL、APPROVED等不同结果，该页面和文档中提及的模板管理页面相关内容相呼应。](_assets/img_VAIubtVkdowQkaxdsxScNEkpneb.png)
- 模板管理页面默认过期时间
   - 已修改为120分钟

- 创建-素材模板-复制优惠码按钮没有被复制到备用素材模板?
   - 还是页面不展示，有的展示，有的不展示？

- 备用素材同步了两个组合，一个有head、body、foot，一个只有head、body，没有foot
   - done-同步了含lto的组合，但是没有同步lto元素

![图片展示的是素材管理界面中素材组合列表。表格包含组合ID、素材模板id - 名称、素材组合预览、组合状态等列。其中，组合ID为1723和1724的素材模板id - 名称均为530 - zlc_0910_001_ai_backup，组合状态均为停用。图片与上下文紧密相关，上下文提到8x8支持COPY_CODE，此图可能是在展示与素材管理相关的数据信息，用于辅助说明素材管理情况。](_assets/img_AFHUbyN6jofHFsxOsU4cEojlnZb.png)

- ADA 不支持 COPY_CODE 按钮，会返回REJECTED，且会触发META，这个需要处理下
   - done
- 8x8支持COPY_CODE
   - done
