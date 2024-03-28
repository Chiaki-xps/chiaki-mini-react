"use strict";
(function () {
    // MiniReact.createElement 就是我们实现的 render function
    /**
     *
     * @param {*} type 必选，表示元素类型，HTML元素，组件名（函数组件中就是函数名），Fragment，一个字符串。
     * @param {*} props 可选，传递给元素的props参数，一个对象
     * @param  {...any} children 可选，元素下的子内容。一个数组
     * @returns React Element的结构
     */
    function createElement(type, props, ...children) {
        return {
            type,
            // react中，元素中的子内容也被视为该元素的props的一部分。
            props: Object.assign(Object.assign({}, props), { children: children.map((child) => {
                    // 最终的文本类型是没有children，不需要再遍历下去
                    const isTextNode = typeof child === 'string' || typeof child === 'number';
                    return isTextNode ? createTextNode(child) : child;
                }) }),
        };
    }
    // 定义文本类型的React Element元素结构
    function createTextNode(nodeValue) {
        return {
            type: 'TEXT_ELEMENT',
            props: {
                nodeValue,
                children: [],
            },
        };
    }
    // vDOM转成Fiber的过程称之为reconcile。但他不是一次性完成的，而是通过scheduler调度器根据时间分片分成多个任务完成。
    // 指向下一个要处理的fiber节点
    let nextUnitOfWork = null;
    // 表示当前正在处理的fiber链表的根节点。wip表示正在的意思
    let wipRoot = null;
    // 旧的fiber链表根节点。current表示当前。
    let currentRoot = null;
    let deletions = null;
    // render阶段
    /**
     *
     * @param {*} element 第一次渲染的时候，拿到的是根组件的信息，type：App。类型是一个函数。需要执行该函数才能拿到App子组件的信息
     * @param {*} container <div id="root"></div>
     */
    function render(element, container) {
        // Tip: 打印render会在workLoop。render会同步执行，而workLoop会在空闲执行。
        // console.log('render');
        // 下面都在进行初始化操作。
        wipRoot = {
            dom: container, // 挂载的展示DOM节点
            props: {
                children: [element], // 第一次渲染的时候，element表示的就是我们的App组件的React Element
            },
            alternate: currentRoot, // 就的Fiber链表
        };
        deletions = [];
        // 当我们nextUnitOfWork设置值以后。由于workLoop不断执行，当发现nextUnitOfWork有值的时候，会进入遍历。
        nextUnitOfWork = wipRoot;
    }
    // 可以把workLoop看成类似一个递归函数，会反复循环执行。目的是为了当有需要处理的Fiber节点出现的时候，进行处理
    function workLoop(deadline) {
        // console.log('workLoop');
        // 是否暂停。闲置时间足够为false，不暂停。不够为true，暂停
        let shouldYield = false;
        while (nextUnitOfWork && !shouldYield) {
            nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
            // 判断是都暂停
            shouldYield = deadline.timeRemaining() < 1;
        }
        if (!nextUnitOfWork && wipRoot) {
            commitRoot();
        }
        // 可以递归
        requestIdleCallback(workLoop);
    }
    // requestIdleCallback存在着浏览器的兼容性和触发不稳定的问题
    // react用的是requestAnimationFrame。
    // requestIdleCallback在浏览器空闲时执行回调函数。回调函数会接受一个IdleDeadline对象作为参数，该对象提供了关于浏览器空闲时间的信息
    requestIdleCallback(workLoop);
    // performUnitOfWork的作用就是遍历fiber树
    function performUnitOfWork(fiber) {
        // 不同的fiber节点会有不同的处理方式
        const isFunctionComponent = fiber.type instanceof Function;
        if (isFunctionComponent) {
            // 函数组件处理
            updateFunctionComponent(fiber);
        }
        else {
            // 原生标签处理
            updateHostComponent(fiber);
        }
        // 上面的方法处理完成我们当前Fiber之后，就会开始寻找下一个处理的Fiber，并返回出去
        // 会先从fiber.child一直找到尽头，之后回到上一个节点找他的相邻兄弟组件，然后继续child，依次循环最后回到div#root
        // 按照下面遍历的顺序，最终fiber树就会变成一个fiber链表。
        if (fiber.child) {
            return fiber.child;
        }
        let nextFiber = fiber;
        while (nextFiber) {
            if (nextFiber.sibling) {
                return nextFiber.sibling;
            }
            // 说明兄弟节点处理完成，回到上一个节点return。
            nextFiber = nextFiber.return;
        }
    }
    // 记录当前执行的fiber节点
    let wipFiber = null;
    let stateHookIndex = null;
    // 函数组件处理：
    function updateFunctionComponent(fiber) {
        wipFiber = fiber;
        // 初始化
        stateHookIndex = 0;
        // 当前节点里的useState、useEffect
        wipFiber.stateHooks = [];
        wipFiber.effectHooks = [];
        // 此时的fiber.type表示的是函数名。执行函数组件。函数组件的返回值React Element
        console.log('返回结果', fiber.type(fiber.props));
        const children = [fiber.type(fiber.props)];
        reconcileChildren(fiber, children);
    }
    function updateHostComponent(fiber) {
        if (!fiber.dom) {
            fiber.dom = createDom(fiber);
        }
        reconcileChildren(fiber, fiber.props.children);
    }
    // 创建真实DOM
    function createDom(fiber) {
        const dom = fiber.type == 'TEXT_ELEMENT'
            ? document.createTextNode('')
            : document.createElement(fiber.type);
        updateDom(dom, {}, fiber.props);
        return dom;
    }
    const isEvent = (key) => key.startsWith('on');
    const isProperty = (key) => key !== 'children' && !isEvent(key);
    const isNew = (prev, next) => (key) => prev[key] !== next[key];
    const isGone = (prev, next) => (key) => !(key in next);
    // 更新DOM，首先删除旧的事件监听器，旧的属性，然后添加新的属性、新的事件监听器。
    function updateDom(dom, prevProps, nextProps) {
        //Remove old or changed event listeners
        Object.keys(prevProps)
            .filter(isEvent)
            .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
            .forEach((name) => {
            const eventType = name.toLowerCase().substring(2);
            dom.removeEventListener(eventType, prevProps[name]);
        });
        // Remove old properties
        Object.keys(prevProps)
            .filter(isProperty)
            .filter(isGone(prevProps, nextProps))
            .forEach((name) => {
            dom[name] = '';
        });
        // Set new or changed properties
        Object.keys(nextProps)
            .filter(isProperty)
            .filter(isNew(prevProps, nextProps))
            .forEach((name) => {
            dom[name] = nextProps[name];
        });
        // Add event listeners
        Object.keys(nextProps)
            .filter(isEvent)
            .filter(isNew(prevProps, nextProps))
            .forEach((name) => {
            const eventType = name.toLowerCase().substring(2);
            dom.addEventListener(eventType, nextProps[name]);
        });
    }
    // 当前fiber节点下，处理他的子元素们
    /**
     *
     * @param {*} wipFiber 当前处理的节点
     * @param {*} elements 该节点的子元素数组
     */
    function reconcileChildren(wipFiber, elements) {
        var _a;
        let index = 0;
        // wipFiber.alternate表示的是旧Fiber链表。
        let oldFiber = (_a = wipFiber.alternate) === null || _a === void 0 ? void 0 : _a.child;
        let prevSibling = null;
        // 将当前fiber下子元素child都处理成fiber节点
        while (index < elements.length || oldFiber != null) {
            const element = elements[index];
            let newFiber = null;
            // diff算法
            const sameType = (element === null || element === void 0 ? void 0 : element.type) == (oldFiber === null || oldFiber === void 0 ? void 0 : oldFiber.type);
            // 节点类型相同
            if (sameType) {
                // 定义fiber对象
                newFiber = {
                    type: oldFiber.type,
                    props: element.props,
                    dom: oldFiber.dom,
                    return: wipFiber,
                    alternate: oldFiber,
                    effectTag: 'UPDATE',
                };
            }
            // 新Fiber元素存在 && 节点类型不同 -> 直接将新fiber替换旧fiber
            if (element && !sameType) {
                newFiber = {
                    type: element.type,
                    props: element.props,
                    dom: null,
                    return: wipFiber,
                    alternate: null,
                    effectTag: 'PLACEMENT',
                };
            }
            // 旧fiber存在 && 类型不同 -> 说明是新的DOM不存在这部份，直接删除
            if (oldFiber && !sameType) {
                oldFiber.effectTag = 'DELETION';
                deletions.push(oldFiber);
            }
            // oldFiber设置成下一个兄弟节点，进行下一次同节点的比较
            if (oldFiber) {
                oldFiber = oldFiber.sibling;
            }
            if (index === 0) {
                // index为0作为当前处理节点的child，后续的index>0,则是child的兄弟节点sibling。
                wipFiber.child = newFiber;
            }
            else if (element) {
                // 此时的prevSibling表示的index-1的节点。即当前newFiber作为上一个fiber的兄弟节点。
                prevSibling.sibling = newFiber;
            }
            // 设置为当前节点，作为下次循环，给该节点设置兄弟节点
            prevSibling = newFiber;
            index++;
        }
    }
    function useState(initialState) {
        var _a;
        const currentFiber = wipFiber;
        const oldHook = (_a = wipFiber.alternate) === null || _a === void 0 ? void 0 : _a.stateHooks[stateHookIndex];
        const stateHook = {
            state: oldHook ? oldHook.state : initialState,
            queue: oldHook ? oldHook.queue : [],
        };
        stateHook.queue.forEach((action) => {
            stateHook.state = action(stateHook.state);
        });
        stateHook.queue = [];
        stateHookIndex++;
        wipFiber.stateHooks.push(stateHook);
        function setState(action) {
            const isFunction = typeof action === 'function';
            stateHook.queue.push(isFunction ? action : () => action);
            wipRoot = Object.assign(Object.assign({}, currentFiber), { alternate: currentFiber });
            nextUnitOfWork = wipRoot;
        }
        return [stateHook.state, setState];
    }
    function useEffect(callback, deps) {
        const effectHook = {
            callback,
            deps,
            cleanup: undefined,
        };
        wipFiber.effectHooks.push(effectHook);
    }
    // 当我们将整棵树遍历成Fiber后，就可以进入commit阶段
    function commitRoot() {
        debugger;
        deletions.forEach(commitWork);
        // div#root本事已经存在，所以从child开始
        commitWork(wipRoot.child);
        commitEffectHooks();
        currentRoot = wipRoot;
        wipRoot = null;
    }
    function commitWork(fiber) {
        if (!fiber) {
            return;
        }
        // 拿到当前处理Fiber的父标签
        let domParentFiber = fiber.return;
        // 假如当前的fiber的父级是App组件，App Fiber并不代表真实的DOM。而应该是上一级的div#root，通过一个循环找到最近的父级
        while (!domParentFiber.dom) {
            domParentFiber = domParentFiber.return;
        }
        // 拿到父级DOM
        const domParent = domParentFiber.dom;
        // 如果当前Fiber是替换，则加入作为父级的子元素，利用appendChild方法
        if (fiber.effectTag === 'PLACEMENT' && fiber.dom != null) {
            domParent.appendChild(fiber.dom);
        }
        //
        else if (fiber.effectTag === 'UPDATE' && fiber.dom != null) {
            updateDom(fiber.dom, fiber.alternate.props, fiber.props);
        }
        else if (fiber.effectTag === 'DELETION') {
            commitDeletion(fiber, domParent);
        }
        commitWork(fiber.child);
        commitWork(fiber.sibling);
    }
    function commitDeletion(fiber, domParent) {
        if (fiber.dom) {
            domParent.removeChild(fiber.dom);
        }
        else {
            commitDeletion(fiber.child, domParent);
        }
    }
    function isDepsEqual(deps, newDeps) {
        if (deps.length !== newDeps.length) {
            return false;
        }
        for (let i = 0; i < deps.length; i++) {
            if (deps[i] !== newDeps[i]) {
                return false;
            }
        }
        return true;
    }
    function commitEffectHooks() {
        function runCleanup(fiber) {
            var _a, _b;
            if (!fiber)
                return;
            (_b = (_a = fiber.alternate) === null || _a === void 0 ? void 0 : _a.effectHooks) === null || _b === void 0 ? void 0 : _b.forEach((hook, index) => {
                var _a;
                const deps = fiber.effectHooks[index].deps;
                if (!hook.deps || !isDepsEqual(hook.deps, deps)) {
                    (_a = hook.cleanup) === null || _a === void 0 ? void 0 : _a.call(hook);
                }
            });
            runCleanup(fiber.child);
            runCleanup(fiber.sibling);
        }
        function run(fiber) {
            var _a;
            if (!fiber)
                return;
            (_a = fiber.effectHooks) === null || _a === void 0 ? void 0 : _a.forEach((newHook, index) => {
                var _a;
                if (!fiber.alternate) {
                    newHook.cleanup = newHook.callback();
                    return;
                }
                if (!newHook.deps) {
                    newHook.cleanup = newHook.callback();
                }
                if (newHook.deps.length > 0) {
                    const oldHook = (_a = fiber.alternate) === null || _a === void 0 ? void 0 : _a.effectHooks[index];
                    if (!isDepsEqual(oldHook.deps, newHook.deps)) {
                        newHook.cleanup = newHook.callback();
                    }
                }
            });
            run(fiber.child);
            run(fiber.sibling);
        }
        runCleanup(wipRoot);
        run(wipRoot);
    }
    const MiniReact = {
        createElement,
        render,
        useState,
        useEffect,
    };
    window.MiniReact = MiniReact;
})();
