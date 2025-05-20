---
title: sinosoft 代码规范
date: 2017-08-25 12:18:45
tags: 
- 代码规范
categories: 技术杂谈
toc: true
---

## 介绍
本文档主要针对我们项目内部正在使用的框架，以及代码审查发现的一些共性问题提出一些开发规范。

### JavaBean 规范

1	驼峰命名法【强制】

2	布尔类型规范【强制】
【说明】所有的布尔类型不允许以 is 开头，否则会导致部分序列化，hibernate 框架出现解析异常。
【反例】
原来项目的 BaseDomain 中标记逻辑删除的字段, 在部分场景下会出现问题

<!-- more -->

```java
    @Column(name = "is_delete")
    private Boolean isDelete = false;
    
    public Boolean getIsDelete() {
            return isDelete;
        }
    
    public void setIsDelete(Boolean isDelete) {
        if(deleteFlag)
            this.deleteDate = new Date();
        this.isDelete = isDelete;
    }
```

tips: 使用 intellij idea 的快捷键（for eclipse）alt+shift+r，
或者菜单栏 Refactor->Rename，可以重构字段名称
【正例】

```java
    @Column(name = "is_delete")
    private Boolean deleteFlag = false;
```

3	装箱类型优于原生类型【推荐】
在业务代码中，更加推荐使用装箱类型 Integer Double Boolean...
【说明】在未设值的情况下，基础类型具有默认值，而装箱类型为 null
以 Boolean 类型为例，如果使用 boolean，那么在未复制时，无法得知其到底是被赋值成了 false，
还是未赋值

### 领域模型规范

首先理解各个常用的领域模型的含义：

| 领域模型 | 全称                   | 中文含义   |
| ---- | -------------------- | ------ |
| DO   | Domain Object        | 领域对象   |
| DTO  | Data Transfer Object | 数据传输对象 |
| VO   | View Object          | 视图对象   |

对于 View Object，PO 等等其他一些的对象不在此做要求，只说明一下常用的几个
DO 就是我们最常用的数据库持久对象，是 OOP 对于现实中的抽象，一般使用 orm 框架映射到数据库
DTO 这一层，目前我们的项目还没有投入使用，即将考虑投入使用，理论上来说，两个微服务模块是严禁共享数据库的
所以 A 模块要查询 B 模块的数据，需要使用 B 模块 app 层暴露出来的 api 来查询，其中 B 模块返回的实体，不能是直接从数据库中
查询出来的 DO，而应该是 DO 转换而成的 DTO。以及其他服务服务用语传输的变量，都叫做 DTO
VO 就是常存在于视图层模板渲染使用的实体类

【推荐】领域模型命名规范
【说明】由于 DO 这一层大家已经养成了习惯，不做要求了。DTO 有些特殊，他常常与业务的传输对象相关，而不限于以 Dto 结尾，如 xxxQuery 也可以是 DTO 对象。VO 对象推荐以 Vo 结尾

### 包结构规范

1	包命名【强制】 

格式如下：公司名. 模块名. 层次名
包名应当尽量使用能够概括模块总体含义, 单词义, 单数, 不包含特殊字符的单词
【正例】: `sinosoftgz.message.admin`
【反例】: `sinosoftgz.mailsms.admin` `sinosoftgz.mail.sms.admin`

2	包结构【推荐】
当项目模块的职责较为复杂，且考虑到以后拓展的情况下，单个模块依旧包含着很多小的业务模块时，应当优先按照业务区分包名

【反例】:

```java
    sinosoftgz.message.admin
        config
            模块公用 Config.java
        service
            模块公用 Service.java
            Mail 私有 Service.java
            MailTemplateService.java
            MailMessageService.java
            Sms 私有 Service.java
            SmsTemplateService.java
            SmsMessageService.java
        web
            模块公用 Controller.java
            IndexController.java
            Mail 私有 Controller.java
            MailTemplateController.java
            MailMessageController.java
            Sms 私有 Controller.java
            SmsTemplateController.java
            SmsMessageController.java
        MailSmsAdminApp.java
```

【正例】: 

```java
    sinosoftgz.message.admin
        config
            模块公用 Config.java
        service
            模块公用 Service.java
        web
            模块公用 Controller.java
            IndexController.java
        mail
            config
                MailConfig.java
            service
                Mail 私有 Service.java
                MailTemplateService.java
                MailMessageService.java
            web
                Mail 私有 Controller.java
                MailTemplateController.java
                MailMessageController.java
        sms
            config
                Smsconfig.java
            service
                Sms 私有 Service.java
                SmsTemplateService.java
                SmsMessageService.java
            web
                Sms 私有 Controller.java
                SmsTemplateController.java
                SmsMessageController.java
        MessageAdminApp.java
```
service 和 controller 以及其他业务模块相关的包相隔太远，或者干脆全部丢到一个包内，单纯用前缀区分，会形成臃肿，充血的包结构。如果是项目结构较为单一，可以仅仅使用前缀区分；如果是项目中业务模块有明显的区分条件，应当单独作为一个包，用包名代表业务模块的含义。

## 容易忽视的细节

1	运算溢出【强制】

【反例】Integer a = Integer b * Integer c;

【正例】Long a =  Integer b * Integer c;(强转)

整数相乘可能会溢出，需要使用 Long 接收

2	Double 类型的精度问题【强制】

Double 不能用于商业计算，使用 BigDecimal 代替

3	BigDecimal 规范【强制】

【反例】

```java
BigDecimal totalMoney = new BigDecimal("100.42");
BigDecimal averageMoney = totalMoney.divide(new BigDecimal("22"));
```
【正例】 

```java
BigDecimal totalMoney = new BigDecimal("100.42");
BigDecimal averageMoney = totalMoney.divide(new BigDecimal("22"),3);
```

业务实体类中的与金额相关的变量统一使用 BigDecimal, 四则运算采用 BigDecimal 的相关 api 进行。
做 ** 除法 ** 时需要额外注意保留精度的问题，否则可能会报异常，并且不易被测试出

4	equals 规范【强制】

【反例】

```
Integer a = 2333;
Integer b = 2333;
System.out.println(a == b);//fasle
Integer a = 2;
Integer b = 2;
System.out.println(a == b);//true
```

【正例】

```java
a.equals(b)
```

要注意正确的比较方法，谨慎使用 ==，它比较的是引用

## 数据库规范
1	必要的地方必须添加索引，如唯一索引，作为条件查询的列【强制】

不添加索引，会造成全表扫描，浪费性能。

2	生产环境，uat 环境，不允许使用 `jpa.hibernate.ddl-auto: create` 自动建表，每次 ddl 的修改需要保留脚本，统一管理【强制】
3	业务数据不能使用 deleteBy... 而要使用逻辑删除 setDeleteFlag(true), 查询时，findByxxxAndDeleteFlag(xxx,false)【强制】

4	如有可替代方案，则禁止使用存储过程和触发器【强制】

5	字段的长度和类型需要按照实际含义定制【推荐】

【反例】

```java
@Entity
class Person{
	private String name;
	private Integer age;
}
```

【正例】

```java
@Entity
class Person{
  	@Column(columnDefinition = "varchar(50)")
	private String name;
    @Column(columnDefinition = "int(3)")
	private Integer age;
}
```

明确字段的长度和类型可以迫使开发者去思考字段所处的业务场景，在性能上，字段长度也可以加强索引的性能。

6	使用外键不要使用数据库层面的约束【强制】

不便于数据迁移，统一在应用层控制关联。


## ORM 规范

【强制】条件查询超过三个参数的，使用 `criteriaQuery`，`predicates` 而不能使用 springdata 的 findBy

【反例】

```java
public Page<GatewayApiDefine> findAll(GatewayApiDefine gatewayApiDefine,Pageable pageable){
        if(Lang.isEmpty(gatewayApiDefine.getRole())){
            gatewayApiDefine.setRole("");
        }
        if(Lang.isEmpty(gatewayApiDefine.getApiName())){
            gatewayApiDefine.setApiName("");
        }
        if(Lang.isEmpty(gatewayApiDefine.getEnabled())){
            return gatewayApiDefineDao.findByRoleLikeAndApiNameLikeOrderByLastUpdatedDesc("%"+gatewayApiDefine.getRole()+"%","%"+gatewayApiDefine.getApiName()+"%",pageable);
        }else{
            return gatewayApiDefineDao.findByRoleLikeAndApiNameLikeAndEnabledOrderByLastUpdatedDesc("%"+gatewayApiDefine.getRole()+"%","%"+gatewayApiDefine.getApiName()+"%",gatewayApiDefine.getEnabled(),pageable);
        }
    }
```

在 Dao 层定义了大量的 findBy 方法，在 Service 写了过多的 if else 判断，导致业务逻辑不清晰

【正例】

```java
public Page<MailTemplateConfig> findAll(MailTemplateConfig mailTemplateConfig, Pageable pageable) {
        Specification querySpecification = (Specification<MailTemplateConfig>) (root, criteriaQuery, criteriaBuilder) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(criteriaBuilder.isFalse(root.get("deleteFlag")));
            // 级联查询 mailTemplate
            if (!Lang.isEmpty(mailTemplateConfig.getMailTemplate())) {
                // 短信模板名称
                if (!Lang.isEmpty(mailTemplateConfig.getMailTemplate().getTemplateName())) {
                    predicates.add(criteriaBuilder.like(root.join("mailTemplate").get("templateName"), String.format("%%%s%%", mailTemplateConfig.getMailTemplate().getTemplateName())));
                }
                // 短信模板类型
                if (!Lang.isEmpty(mailTemplateConfig.getMailTemplate().getTemplateType())) {
                    predicates.add(criteriaBuilder.equal(root.join("mailTemplate").get("templateType"), mailTemplateConfig.getMailTemplate().getTemplateType()));
                }
            }
            // 产品分类
            if (!Lang.isEmpty(mailTemplateConfig.getProductType())) {
                predicates.add(criteriaBuilder.equal(root.get("productType"), mailTemplateConfig.getProductType()));
            }
            // 客户类型
            if (!Lang.isEmpty(mailTemplateConfig.getConsumerType())) {
                predicates.add(criteriaBuilder.equal(root.get("consumerType"), mailTemplateConfig.getConsumerType()));
            }
            return criteriaBuilder.and(predicates.toArray(new Predicate[predicates.size()]));
        };
        return mailTemplateConfigRepos.findAll(querySpecification, pageable);
    }
```
条件查询是 admin 模块不可避免的一个业务功能，使用 `criteriaQuery` 可以轻松的添加条件，使得代码容易维护，他也可以进行分页，排序，连表操作，充分发挥 jpa 面向对象的特性，使得业务开发变得快捷。

## 数据结构

1	集合中迭代过程中增删数据使用迭代器完成

【反例】

```java
List<String> a = new ArrayList<String>();
a.add("1"); 
a.add("2"); 
for (String temp : a) { 
  if("1".equals(temp)){ 
	a.remove(temp); 
  } 
}
```

【正例】

```java
Iterator<String> it = a.iterator(); 
while(it.hasNext()){ 
  String temp = it.next(); 
  if(("1".equals(temp)){ 
    it.remove(); 
  } 
}
```

2	hashCode 和 equals 重写规范【强制】

作为 Map 键值，Set 值的实体类，务必重写 hashCode 与 equals 方法，可参考《effective java》。重写时务必做到以下几点

- ** 自反性 **:  x.equals(x) 一定是 true
- ** 对 null**:  x.equals(null) 一定是 false
- ** 对称性 **:  x.equals(y)  和  y.equals(x) 结果一致
- ** 传递性 **:  a 和 b equals , b 和 c  equals，那么 a 和 c 也一定 equals。
- ** 一致性 **:  在某个运行时期间，2 个对象的状态的改变不会不影响 equals 的决策结果，那么，在这个运行时期间，无论调用多少次 equals，都返回相同的结果。做到无状态。

## 禁止使用魔法数字

【模型层与业务层】【强制】
一些固定业务含义的代码可以使用枚举类型，或者 final static 常量表示，在设值时，不能直接使用不具备业务含义的数值。

【反例】

```java
// 实体类定义
/**
  * 发送设置标志 (1：立即发送 2：预设时间发送)
  */
@Column(columnDefinition = "varchar(1) comment' 发送设置标志 '")
protected String sendFlag;
// 业务代码赋值使用
MailMessage mailMessage = new MailMessage();
mailMessage.setSendSuccessFlag("1");
mailMessage.setValidStatus("0");
mailMessage.setCustom(true);
```

【正例】：使用 final static 常量: 

```java
// 实体类定义
	/**
     * 发送设置标志
     *
     * @see sendFlag
     */
    public final static String SEND_FLAG_NOW = "1"; // 立即发送
    public final static String SEND_FLAG_DELAY = "2"; // 预设时间发送

    /**
     * 发送成功标志
     *
     * @see sendSuccessFlag
     */
    public final static Map<String, String> SEND_SUCCESS_FLAG_MAP = new LinkedHashMap<>();
    public final static String SEND_WAIT = "0";
    public final static String SEND_SUCCESS = "1";
    public final static String SEND_FAIL = "2";

    static {
        SEND_SUCCESS_FLAG_MAP.put(SEND_WAIT, "未发送");
        SEND_SUCCESS_FLAG_MAP.put(SEND_SUCCESS, "发送成功");
        SEND_SUCCESS_FLAG_MAP.put(SEND_FAIL, "发送失败");
    }
	/**
     * 发送设置标志 (1：立即发送 2：预设时间发送)
     */
    @Column(columnDefinition = "varchar(1) comment' 发送设置标志 '")
    protected String sendFlag;

// 业务代码赋值使用
MailMessage mailMessage = new MailMessage();
mailMessage.setSendSuccessFlag(MailMessage.SEND_WAIT);
mailMessage.setValidStatus(MailMessage.VALID_WAIT);
mailMessage.setCustom(true);
```
【说明】魔法数字不能使代码一眼能够看明白到底赋的是什么值，并且，实体类发生变化后，可能会导致赋值错误，与预期赋值不符合且错误不容易被发现。

【正例】：也可以使用枚举类型避免魔法数字

```java
protected String productType;

protected String productName;

@Enumerated(EnumType.STRING)
protected ConsumerTypeEnum consumerType;

@Enumerated(EnumType.STRING)
protected PolicyTypeEnum policyType;

@Enumerated(EnumType.STRING)
protected ReceiverEnum receiver;
public enum ConsumerTypeEnum {
  PERSONAL, ORGANIZATION;

  public String getLabel() {
    switch (this) {
      case PERSONAL:
        return "个人";
      case ORGANIZATION:
        return "团体";
      default:
        return "";
    }
  }
}
```
【视图层】【推荐】
例如，页面迭代 select 的 option，不应该在 view 层判断，而应该在后台传入 map 在前台迭代
【正例】：
```java
model.put("typeMap",typeMap);

模板类型：<select type="text" name="templateType">
	<option value=""> 全部 </option>
	<#list typeMap?keys as key>
		<option <#if ((mailTemplate.templateType!"")==key)>selected="selected"</#if>value="${key}">${typeMap[key]}</option>
	 </#list>
</select>
```
【反例】：
```java
模板类型：<select type="text" name="templateType">
	<option value=""> 全部 </option>
	<option <#if ${xxx.templateType!}=="1"
		selected="selected"</#if> value="1"> 承保通知 </option>
	...
	<option <#if ${xxx.templateType!}=="5"
		selected="selected"</#if> value="5"> 核保通知 </option>
</select>
```
否则修改后台代码后，前端页面也要修改，设计原则应当是修改一处，其他全部变化。且 1，2...,5 的含义可能会变化，不能从页面得知 value 和 option 的含义是否对应。

## 并发处理

项目中会出现很多并发问题，要做到根据业务选择合适的并发解决方案，避免线程安全问题

1	simpleDateFormat 有并发问题，不能作为 static 类变量【强制】
【反例】：
这是我在某个项目模块中，发现的一段代码
```java
Class XxxController{
	public final static SimpleDateFormat simpleDateFormat = new SimpleDateFormat("yyyy-MM-dd hh:mm:ss");
	
	@RequestMapping("/xxxx")
	public String xxxx(String dateStr){
		XxxEntity xxxEntity = new XxxEntity();
		xxxEntity.setDate(simpleDateFormat.parse(dateStr));
		xxxDao.save(xxxEntity);
		return "xxx";
	}
}
```
【说明】SimpleDateFormat 是线程不安全的类，不能作为静态类变量给多线程并发访问。如果不了解多线程，可以将其作为实例变量，每次使用时都 new 一个出来使用。不过更推荐使用 ThreadLocal 来维护，减少 new 的开销。
【正例】一个使用 ThreadLocal 维护 SimpleDateFormat 的线程安全的日期转换类：
```java
public class ConcurrentDateUtil {

    private static ThreadLocal<DateFormat> threadLocal = new ThreadLocal<DateFormat>() {
        @Override
        protected DateFormat initialValue() {
            return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        }
    };

    public static Date parse(String dateStr) throws ParseException {
        return threadLocal.get().parse(dateStr);
    }

    public static String format(Date date) {
        return threadLocal.get().format(date);
    }
}
```

2	名称唯一性校验出现的线程安全问题【推荐】
各个项目的 admin 模块在需求中经常会出现要求名称不能重复，即唯一性问题。通常在前台做 ajax 校验，后台使用 `select count(1) from table_name where name=?` 的方式查询数据库。这么做无可厚非，但是在极端的情况下，会出现并发问题。两个线程同时插入一条相同的 name，如果没有做并发控制，会导致出现脏数据。如果仅仅是后台系统，那么没有必要加锁去避免，只需要对数据库加上唯一索引，并且再 web 层或者 service 层捕获数据异常即可。
【正例】：

```java
// 实体类添加唯一索引
@Entity
@Table(name = "mns_mail_template",
        uniqueConstraints = {@UniqueConstraint(columnNames = {"templateName"})}
)
public class MailTemplate extends AbstractTemplate {
	/**
     * 模板名称
     */
    @Column(columnDefinition = "varchar(160) comment' 模板名称 '")
    private String templateName;
}

// 业务代码捕获异常
@RequestMapping(value = {"/saveOrUpdate"}, method = RequestMethod.POST)
    @ResponseBody
    public AjaxResponseVo saveOrUpdate(MailTemplate mailTemplate) {
        AjaxResponseVo ajaxResponseVo = new AjaxResponseVo(AjaxResponseVo.STATUS_CODE_SUCCESS, "操作成功", "邮件模板定义", AjaxResponseVo.CALLBACK_TYPE_CLOSE_CURRENT);
        try {
            // 管理端新增时初始化一些数据
            if (Lang.isEmpty(mailTemplate.getId())) {
                mailTemplate.setValidStatus(MailTemplate.VALID_WAIT);
            }
            mailTemplateService.save(mailTemplate);
        } catch (DataIntegrityViolationException ce) {
            ajaxResponseVo.setStatusCode(AjaxResponseVo.STATUS_CODE_ERROR);
            ajaxResponseVo.setMessage("模板名称已经存在");
            ajaxResponseVo.setCallbackType(null);
            logger.error(ce);
        } catch (Exception e) {
            ajaxResponseVo.setStatusCode(AjaxResponseVo.STATUS_CODE_ERROR);
            ajaxResponseVo.setMessage("操作失败!");
            ajaxResponseVo.setCallbackType(null);
            logger.error(e);
        }
        return ajaxResponseVo;
    }
```

【说明】关于其他一些并发问题, 如分布式锁，CAS，不仅仅是一篇文档能够讲解清楚的，需要对开发有很深的理解。

3	余额扣减，库存扣减，积分发放等敏感并发操作【强制】

这一块通常交给有经验的开发来完成，但所有人都需要注意。原则是事务保障，幂等保障等等设计原则。

【反例】

```java
//Transaction start
User user = UserDao.findById("1");
user.setBalance(user.getBalance()+100.00);
...// 其他耗时操作
UserDao.save(user);
//Transaction commit
```

【正例】

```java
//Transaction start
lock...
User user = UserDao.findById("1");
user.setBalance(user.getBalance()+100.00);
...// 其他耗时操作
UserDao.save(user);
release lock...
//Transaction commit
```

并发场景必须加锁，根据业务场景决定到底加什么锁，sychronized，ReentrantLock，version 乐观锁，for update 悲观锁（不推荐），redis，zookeeper 实现的分布式锁等等。

## moton 使用注意事项

1	包的扫描【注意】

每个模块都要扫描自身的项目结构
```yaml
mail-sms-admin:application.yml

motan:
  client-group: sinosoftrpc
  client-access-log: false
  server-group: sinosoftrpc
  server-access-log: false
  export-port: ${random.int[9001,9999]}
  zookeeper-host: 127.0.0.1:2181
  annotaiong-package: sinosoftgz.message.admin
```
app 模块由于将 api-impl 脱离出了自身的模块，通常还需要扫描 api-impl 的模块

配置 pom.xml 依赖 

```xml
<dependency>
	<groupId>sinosoftgz</groupId>
	<artifactId>mail-sms-api-impl</artifactId>
</dependency>
```

配置 spring ioc 扫描 AutoImportConfig.java

```java
@ComponentScans({
        @ComponentScan(basePackages = {"sinosoftgz.message.app", "sinosoftgz.message.api"})
})
```

配置 motan 扫描 mail-sms-app:application.yml

```yaml
motan:
  annotaiong-package: sinosoftgz.message.app,sinosoftgz.message.api
  client-group: sinosoftrpc
  client-access-log: true
  server-group: sinosoftrpc
  server-access-log: true
  export-port: ${random.int[9001,9999]}
  zookeeper-host: localhost:2181
```

2	motan 跨模块传输实体类时懒加载失效【注意】
遇到的时候注意一下，由于 jpa，hibernate 懒加载的问题，因为其内部使用动态代理去实现的懒加载，导致懒加载对象无法被正确的跨模块传输，此时需要进行深拷贝。
【正例】：

```java
/**
     * 深拷贝 OrderMain 对象，主要用于防止 Hibernate 序列化懒加载 Session 关闭问题
     * <p/>
     * //     * @param order
     *
     * @return
     */
    public OrderMain cpyOrder(OrderMain from, OrderMain to) {
        OrderMain orderMainNew = to == null ? new OrderMain() : to;
        Copys copys = Copys.create();
        List<OrderItem> orderItemList = new ArrayList<>();
        List<SubOrder> subOrders = new ArrayList<>();
        List<OrderGift> orderGifts = new ArrayList<>();
        List<OrderMainAttr> orderMainAttrs = new ArrayList<>();
        OrderItem orderItemTmp;
        SubOrder subOrderTmp;
        OrderGift orderGiftTmp;
        OrderMainAttr orderMainAttrTmp;
        copys.from(from).excludes("orderItems", "subOrders", "orderGifts", "orderAttrs").to(orderMainNew).clear();
        if (!Lang.isEmpty(from.getOrderItems())) {
            for (OrderItem i : from.getOrderItems()) {
                orderItemTmp = new OrderItem();
                copys.from(i).excludes("order").to(orderItemTmp).clear();
                orderItemTmp.setOrder(orderMainNew);
                orderItemList.add(orderItemTmp);
            }
            orderMainNew.setOrderItems(orderItemList);
        }
        SubOrderItem subOrderItem;
        List<SubOrderItem> subOrderItemList = new ArrayList<>();
        if (from.getSubOrders() != null) {
            for (SubOrder s : from.getSubOrders()) {
                subOrderTmp = new SubOrder();
                copys.from(s).excludes("order", "subOrderItems").to(subOrderTmp).clear();
                subOrderTmp.setOrder(from);
                for (SubOrderItem soi : s.getSubOrderItems()) {
                    subOrderItem = new SubOrderItem();
                    copys.from(soi).excludes("order", "subOrder", "orderItem").to(subOrderItem).clear();
                    subOrderItem.setOrder(orderMainNew);
                    subOrderItem.setSubOrder(subOrderTmp);
                    subOrderItemList.add(subOrderItem);
                    if (!Lang.isEmpty(soi.getOrderItem())) {
                        for (OrderItem i : orderMainNew.getOrderItems()) {
                            if (i.getId().equals(soi.getOrderItem().getId())) {
                                subOrderItem.setOrderItem(soi.getOrderItem());
                            } else {
                                subOrderItem.setOrderItem(soi.getOrderItem());
                            }
                        }
                    }
                }
                subOrderTmp.setSubOrderItems(subOrderItemList);
                subOrders.add(subOrderTmp);
            }
            orderMainNew.setSubOrders(subOrders);
        }
        if (from.getOrderGifts() != null) {
            for (OrderGift og : from.getOrderGifts()) {
                orderGiftTmp = new OrderGift();
              copys.from(og).excludes("order").to(orderGiftTmp).clear();
                orderGiftTmp.setOrder(orderMainNew);
                orderGifts.add(orderGiftTmp);
            }
            orderMainNew.setOrderGifts(orderGifts);
        }

        if (from.getOrderAttrs() != null) {
            for (OrderMainAttr attr : from.getOrderAttrs()) {
                orderMainAttrTmp = new OrderMainAttr();
                copys.from(attr).excludes("order").to(orderMainAttrTmp).clear();
                orderMainAttrTmp.setOrder(orderMainNew);
                orderMainAttrs.add(orderMainAttrTmp);
            }
            orderMainNew.setOrderAttrs(orderMainAttrs);
        }
        return orderMainNew;
    }
```

## 公用常量规范
1	模块常量【强制】
模块自身公用的常量放置于模块的 Constants 类中，以 final static 的方式声明
```java
public class Constants {
    public static final String birthdayPattern = "yyyy-MM-dd"; // 生日格式
    public static final String inputTimePattern = "yyyy-MM-dd HH:mm:ss"; // 录入时间格式

    public static class PolicyType {
        public static final String personal = "0"; // 个单
        public static final String group = "1"; // 团单
    }

    public static class InsuredNature {
        public static final String naturePerson = "1"; // 自然人
        public static final String artificialPerson = "0"; // 法人
    }

    public static class InsuredIdentity {
        public static final String myself = "0"; // 本人
    }

    public static class JfeeFlag {
        public static final String noFeeFlag = "0"; // 非见费标志
        public static final String feeFlag = "1"; // 见费标志
    }

    public static class ItemKindFlag {
        public static final String mainRiskFlag = "1"; // 主险标志
        public static final String additionalRiskFlag = "2"; // 附加险标志
        public static final String otherRiskFlag = "3"; // 其它标志
    }

    public static class CalculateAmountFlag {
        public static final String calculateFlag = "Y"; // 计算保额标志
        public static final String noCalculateFlag = "N"; // 不计算保额标志
    }

    public static class LimitGrade {
        public static final String policyLevel = "1"; // 限额 / 免赔保单级别
        public static final String clauseLevel = "2"; // 限额 / 免赔条款级别
    }

    /**
     * 批改类型
     *
     * 命名规则：对象（可选）+ 行为
     */
    public static class EndorType {
        public static final String collectivePolicyInsuredModify = "22"; // 团单变更被保险人
        public static final String collectivePolicyInsuredAdd = "Z1"; // 团单批增被保险人
        public static final String collectivePolicyInsuredRemove = "J1"; // 团单批减被保险人
        public static final String surrender = "04"; // 全单退保
        public static final String withdraw = "05"; // 注销
        public static final String insurancePeriodModify = "06"; // 平移保险期限
        public static final String applicantModify = "H01"; // 更改投保人
        public static final String customerModify = "50"; // 变更客户信息
        public static final String insuredModify = "29"; // 变更被保人职业
        public static final String individualPolicyBeneficiaryModify = "03"; // 变更受益人信息
        public static final String engageModify = "15"; // 变更特别约定
        public static final String individualPolicyInsuredModify = "77";// 个单变更被保人
    }
}
```

Constants 类在一个限界上下文只能有一个，一个限界上下文包含了一整个业务模块（如 policy-admin,policy-admin,policy-api,policy-model）
构成一个限界上下文

在 Constants 类中使用静态内部类尽量细化到常量的归属，不要散放

2	项目常量【强制】
项目公用的常量放置于 util 模块的 GlobalContants 类中，以内部类和 final static 的方式声明

```java
public abstract class GlobalContants {
	/**
     * 返回的状态
     */
    public class ResponseStatus{
        public static final String SUCCESS = "success";// 成功
        public static final String ERROR = "error";// 错误
    }

	/**
	 * 响应状态
	 */
    public class ResponseString{
        public static final String STATUS = "status";// 状态
        public static final String ERROR_CODE = "error";// 错误代码
        public static final String MESSAGE = "message";// 消息
        public static final String DATA = "data";// 数据
    }
    ...
}
```

## 日志规范

1 打印日志时不允许拼接字符串【强制】

【反例】log.debug ("Load No." + i + "object," + object);

【正例】log.debug("Load No.{} object, {}" , i , object);

字符串的计算是在编译期，日志级别如果是 INFO，就等于在浪费机器的性能，无谓的字符串拼接。

2 预防空指针【强制】

【反例】log.debug("Load student(id={}), name: {}" , id , student.getName() );

【正例】log.debug("Load student(id={}), student: {}" , id , student);

不要在日志中调用对象的方法获取值，除非确保该对象肯定不为 null，否则很有可能会因为日志的问题而导致应用产生空指针异常。实现需要打印日志的实体类的 toString 方法或者使用 JSON.toString

3 输出异常信息

【反例】log.error(e.getMessage,e);        log.error("邮件发送失败，接收人姓名：{} ，e : {}", username, e);

【正例】log.error("邮件发送失败，接收人姓名：{}", username, e);

e 包含了全部的异常堆栈信息，是 e.getMessage 的父集，出现异常一定要保证输出堆栈信息。并且要保证 exception 作为 log 的重载方法的最后一个参数。

4 Logger 声明规范

【正例】Logger logger = LoggerFactory.getLogger(Student.class);

保证某个类的字节码作为日志跟踪标识，方便定位日志的出处。

## 2018-02-27 补充规范

## 日志规范

1 与外部对接接口的返回报文需要使用 Info 级别打印，以便于跟踪接口信息

【正例】log.info("供应商接口返回报文:{}",JSON.toString(venderDto));

2 内部接口的关键参数需要使用 Info 级别打印，如下单时的订单号，下单人信息，订单金额等关键信息。

3 一般方法为了方便排查问题，建议打上必要的日志

## 编码细节

1 session，request，response 等 http 生命周期的对象不应该传入 service 层

原因：不便于单元测试；不便于 service 重用

2 注意判空

```java
String memberName = (String) request.getSession().getAttribute(GlobalContants.SESSION_MEMBER_NAME);
if(Lang.isE)
userService.getByName(memberName); 

List<UserDto> users =  userApi.findByStatus(String status);
if()
for(UserDto user:users){
    
}
```

如果确定不为空，可以不判断；对于不确定的情况一定要做空判断

3 motan 的重试次数

所有的操作分为 CRUD，查询 -- 一般可以设置 2 次重试，增删改不可以重试，除非保证幂等。

全局配置设置重试次数应当为 0 次。

```
ProtocolConfigBean.setRetries(0);//protocol 级别
@MotanService(retries = 2)// 注意! 服务端配置是无效的
@MotanReferer(retries = 2)// 有效 referer 级别
```

motan 中的配置覆盖优先级：method > referer > basic referer > protocol

可以修改单个 service 的重试次数

4 XxxProperties 类代替 @Value

@Value 容器加载顺序的导致空值的 bug，使用 @ConfigurationProperties 实现 Properties 类更加面向对象

5 RedisTemplate 和 StringRedisTemplate 的使用细节

RedisTemplate.put("hello","world");

StringRedisTemplate.get("hello").equals("world") == false

6 及时清理不再使用的代码，可以在系统回归之后的节点或者合并到主干的节点删除注释掉的代码

## 软件设计原则与微服务设计原则

1 接口设计应当符合聚合根模式

orderMain 主订单包含 List<orderItem> 订单项，包含 List<subOrder> 子订单 等等项

设计 Api 时，只能存在一个 orderMainApi ，而不能存在 orderItemApi 和 subOrderApi。

其他模块如何获取订单项 orderItem 的数据？只能通过访问 orderMain ，从中获取 orderItem。

不同服务之间进行远程调用，只能访问对方的聚合根对象。

2 面向对象，函数式，设计模式等编程范式

面向对象：继承，封装，多态

函数式：lamba，streamAPI

设计模式：单例模式，工厂模式，适配器模式，模板方法模式

多范式编程与最小表达力原则

3 DTO 的意义

dto 应该存在于 api 层，不应该存在于 model 层，model 只应该对本模块的 service 可见，web 不可见，其他模块不可见。使用 DTO 解耦模块之间的依赖。

4 Api 层的注释要全

5 ApiImpl 层的意义

仅仅作为转换，不添加任何业务逻辑。ApiImpl 层不应该出现 DO 对象。

6 Stub 的意义 Facede

对于外部接口的调用，使用 Stub 作为外部接口的包装，在本模块的 service 类中需要调用外部 API 时，则应当调用 Stub。Stub 代表着远程接口在本地的代理。

7 DevOps 八荣八耻

以可配置为荣，以硬编码为耻

以互备为荣，以单点为耻

以随时重启为荣，以不能迁移为耻

以整体交付为荣，以部分交付为耻

以无状态为荣，以有状态为耻

以标准化为荣，以特殊化为耻

以自动化工具为荣，以手动和人肉为耻

以无人值守为荣，以人工介入为耻

8 领域驱动设计与微服务设计

** 实体（Entity）和值对象（Value Object）的区分 **

实体具有生命周期，需要继承 BaseDomain；值对象没有生命周期，只起到修饰作用。

举例：Protocol 协议下包含 List<ProtocolProduct> 协议商品, ProtocolProduct 协议商品包含 List<ProtocolProductPicture> 商品轮播图。

此时 Protocol 是聚合根也是实体，List<ProtocolProduct> 介于实体和值对象之间，需要视需求而定，而 ProtocolProductPicture 则必然是值对象属性。

对于实体的删除使用逻辑删除，对于值对象的删除使用物理删除。

** 数据库操作使用充血模型而不是贫血模型 **

代码见 ProtocolService，查询使用 Specification 模式，曾经强调过，在公会礼包和协议采购已经在实践。具体表现：Repository 层应该为空实现。update = find + 持久化对象的内存操作 + save

** 微服务设计 **

确定领域的限界上下文，微服务的边界。微服务架构是一件好事，逼着大家关注设计软件的合理性，如果原来在单体式架构中领域分析、面向对象设计做不好，换成微服务会把这个问题成倍的放大。微服务架构首先要关注的不是 RPC/ServiceDiscovery/Circuit Breaker 这些概念，也不是 Eureka/Docker/SpringCloud/Zipkin 这些技术框架，而是服务的边界、职责划分，划分错误就会陷入大量的服务间的相互调用和分布式事务中，这种情况微服务带来的不是便利而是麻烦。

## 线程池注意事项

1 如果在每个方法中实例化线程池，那么要在方法结束时 shutdown 线程池，否则会导致内存溢出，导致服务器崩溃。

@Service

public class SomeService {

​    

​    public void concurrentExecute() {

​        ExecutorService executorService = Executors.newFixedThreadPool(10);

​        executorService.execute(new Runnable() {

​            @Override

​            public void run() {

​                System.out.println("executed...");

​            }

​        });

​        executorService.shutdown();// 否则 executorService 永远不会被回收

​    }

}

2 线程池嵌套使用可能会导致死锁

@Service

```
public class SomeService {
    
    public void concurrentExecute() {
        ExecutorService executorService = Executors.newFixedThreadPool(10);
        executorService.execute(new Runnable() {
            @Override
            public void run() {
                // 复用了一个线程池，会导致子任务卡死其他的主任务
                executorService.execute(new Runnable() {
                    @Override
                    public voud run() {
                        //doSomething...
                    }
                })
            }
        });
        executorService.shutdown();
    }


}
```

3【强制】线程池不允许使用 Executors 去创建，而是通过 ThreadPoolExecutor 的方式，
这样的处理方式让写的同学更加明确线程池的运行规则，规避资源耗尽的风险。

我下面整理了一些 线程池 相关的知识点

## Executors

Executors 是一个线程池框架，其最终还是通过 new ThreadPoolExecutor 的方式创建的线程池。Executors 提供了几个工厂方法。但这几种都不应该在生产中直接使用

### newSingleThreadExecutor

创建一个单线程的线程池。这个线程池只有一个线程在工作，也就是相当于单线程串行执行所有任务。如果这个唯一的线程因为异常结束，那么会有一个新的线程来替代它。
此线程池保证所有任务的执行顺序按照任务的提交顺序执行。

```
new ThreadPoolExecutor(1, 1,0L,TimeUnit.MILLISECONDS,new LinkedBlockingQueue<Runnable>());
```

### newFixedThreadPool

创建固定大小的线程池。每次提交一个任务就创建一个线程，直到线程达到线程池的最大大小。
线程池的大小一旦达到最大值就会保持不变，如果某个线程因为执行异常而结束，那么线程池会补充一个新线程。

```
new ThreadPoolExecutor(nThreads, nThreads, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<Runnable>());
```

### newCachedThreadPool

创建一个可缓存的线程池。如果线程池的大小超过了处理任务所需要的线程，
那么就会回收部分空闲（60 秒不执行任务）的线程，当任务数增加时，此线程池又可以智能的添加新线程来处理任务。
此线程池不会对线程池大小做限制，线程池大小完全依赖于操作系统（或者说 JVM）能够创建的最大线程大小。

```
new ThreadPoolExecutor(0, Integer.MAX_VALUE, 60L, TimeUnit.SECONDS,new SynchronousQueue<Runnable>());
```

### ThreadPoolExecutor

再看看如何使用 ThreadPoolExecutor 创建线程池，我们需要理解各个构造方法的参数：

```
    public ThreadPoolExecutor(int corePoolSize,
                              int maximumPoolSize,
                              long keepAliveTime,
                              TimeUnit unit,
                              BlockingQueue<Runnable> workQueue,
                              ThreadFactory threadFactory,
                              RejectedExecutionHandler handler) 
```

corePoolSize - 线程池核心池的大小。
maximumPoolSize - 线程池的最大线程数。
keepAliveTime - 当线程数大于核心时，此为终止前多余的空闲线程等待新任务的最长时间。
unit - keepAliveTime 的时间单位。
workQueue - 用来储存等待执行任务的队列。
threadFactory - 线程工厂。
handler - 拒绝策略。

#### 关注点 1 线程池大小

线程池有两个线程数的设置，一个为核心池线程数，一个为最大线程数。
在创建了线程池后，默认情况下，线程池中并没有任何线程，等到有任务来才创建线程去执行任务，除非调用了 prestartAllCoreThreads()或者 prestartCoreThread() 方法
当创建的线程数等于 corePoolSize 时，会加入设置的阻塞队列。当队列满时，会创建线程执行任务直到线程池中的数量等于 maximumPoolSize。

#### 关注点 2 适当的阻塞队列

java.lang.IllegalStateException: Queue full
方法 抛出异常 返回特殊值 一直阻塞 超时退出
插入方法 add(e) offer(e) put(e) offer(e,time,unit)
移除方法 remove()poll() take()poll(time,unit)
检查方法 element()peek() 不可用 不可用

ArrayBlockingQueue ：一个由数组结构组成的有界阻塞队列。
LinkedBlockingQueue ：一个由链表结构组成的有界阻塞队列。
PriorityBlockingQueue ：一个支持优先级排序的无界阻塞队列。
DelayQueue： 一个使用优先级队列实现的无界阻塞队列。
SynchronousQueue： 一个不存储元素的阻塞队列。
LinkedTransferQueue： 一个由链表结构组成的无界阻塞队列。
LinkedBlockingDeque： 一个由链表结构组成的双向阻塞队列。

#### 关注点 3 明确拒绝策略

ThreadPoolExecutor.AbortPolicy: 丢弃任务并抛出 RejectedExecutionException 异常。 (默认)
ThreadPoolExecutor.DiscardPolicy：也是丢弃任务，但是不抛出异常。
ThreadPoolExecutor.DiscardOldestPolicy：丢弃队列最前面的任务，然后重新尝试执行任务（重复此过程）
ThreadPoolExecutor.CallerRunsPolicy：由调用线程处理该任务

说明：Executors 各个方法的弊端：
1）newFixedThreadPool 和 newSingleThreadExecutor:
主要问题是堆积的请求处理队列可能会耗费非常大的内存，甚至 OOM。
2）newCachedThreadPool 和 newScheduledThreadPool:
主要问题是线程数最大数是 Integer.MAX_VALUE，可能会创建数量非常多的线程，甚至 OOM。

## 

我推荐的创建线程池的方式：

1 new ThreadPoolExecutor(全参构造) 自己控制

corePoolSize - 线程池核心池的大小。

maximumPoolSize - 线程池的最大线程数。

keepAliveTime - 当线程数大于核心时，此为终止前多余的空闲线程等待新任务的最长时间。

unit - keepAliveTime 的时间单位。

workQueue - 用来储存等待执行任务的队列。

threadFactory - 线程工厂。

handler - 拒绝策略。

2 使用 Spring 提供的线程池（强烈推荐）

```
@Bean
public ThreadPoolTaskExecutor someBizThreadPool(){
    ThreadPoolTaskExecutor threadPoolTaskExecutor = new ThreadPoolTaskExecutor();
    threadPoolTaskExecutor.setCorePoolSize(10);
    threadPoolTaskExecutor.setMaxPoolSize(100);
    threadPoolTaskExecutor.setQueueCapacity(200);
    threadPoolTaskExecutor.setKeepAliveSeconds(60);
    threadPoolTaskExecutor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
    return threadPoolTaskExecutor;
}
```

运行规则如下：

如果此时线程池中的数量小于 corePoolSize，即使线程池中的线程都处于空闲状态，也要创建新的线程来处理被添加的任务。

如果此时线程池中的数量等于 corePoolSize，但是缓冲队列 workQueue 未满，那么任务被放入缓冲队列。

如果此时线程池中的数量大于 corePoolSize，缓冲队列 workQueue 满，并且线程池中的数量小于 maxPoolSize，建新的线程来处理被添加的任务。

如果此时线程池中的数量大于 corePoolSize，缓冲队列 workQueue 满，并且线程池中的数量等于 maxPoolSize，那么通过 handler 所指定的策略来处理此任务。也就是：处理任务的优先级为：核心线程 corePoolSize、任务队列 workQueue、最大线程 maximumPoolSize，如果三者都满了，使用 handler 处理被拒绝的任务（抛出异常）。

当线程池中的线程数量大于 corePoolSize 时，如果某线程空闲时间超过 keepAliveTime，线程将被终止。这样，线程池可以动态的调整池中的线程数。











