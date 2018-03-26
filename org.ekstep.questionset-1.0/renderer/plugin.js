/**
 * Plugin to create repo instance and to register repo instance
 * @extends EkstepRenderer.Plugin
 * @author sachin.kumar@goodworklabs.com>
 */
IteratorPlugin.extend({
    _type: 'org.ekstep.questionset',
    _isContainer: true,
    _render: true,
    _questionSetConfig: {
        'total_items': 1,
        'show_feedback': true,
        'shuffle_questions': false
    },
    _masterQuestionSet: [],
    _renderedQuestions: [],
    _questionStates: {},
    _firstQuestion: false,
    _lastQuestion: false,
    _currentQuestion: undefined,
    _currentQuestionState: undefined,
    _loadedTemplates: [],
    _stageObject: undefined,
    _displayedTryAgain: false,
    _constants: {
        questionPluginId: 'org.ekstep.question',
        qsElement: '#questionset',
        prevCSS: {
            cursor: 'pointer',
            position: 'absolute',
            width: '7.5%',
            top: '44%',
            left: '1%'
        },
        nextCSS: {
            cursor: 'pointer',
            position: 'absolute',
            width: '7.5%',
            top: '44%',
            right: '1%'
        },
        qsPrefix: 'qs',
        qsQuizPlugin: 'org.ekstep.questionset.quiz'
    },
    _questionUnitPlugins: [],
    initialize: function () {
        var ctrlPath = org.ekstep.pluginframework.pluginManager.resolvePluginResource(this._manifest.id, this._manifest.ver, "renderer/controller/questionset_ctrl.js");
        var tempPath = org.ekstep.pluginframework.pluginManager.resolvePluginResource(this._manifest.id, this._manifest.ver, "renderer/templates/questionset_template.html");
        org.ekstep.service.controller.loadNgModules(tempPath, ctrlPath);
    },
    initPlugin: function (data) {
        var instance = this;

        // Register for navigation hooks
        this.registerNavigation(instance);

        // On content replay, reset all question set information.
        EkstepRendererAPI.addEventListener('renderer:content:replay', function (event) {
            instance.resetQS.call(instance);
        }, instance);

        // Remove duplicate event listener for 'renderer:nextStage'
        EventBus.listeners['renderer:nextStage'] = [];
        EkstepRendererAPI.addEventListener('renderer:nextStage', function (event) {
            instance.renderNextQuestion.call(instance);
        }, instance);

        // Event handler to save question state
        EventBus.listeners['org.ekstep.questionset:saveQuestionState'] = undefined;
        EkstepRendererAPI.addEventListener(instance._data.pluginType + ':saveQuestionState', function (event) {
            var state = event.target;
            if(instance._currentQuestion) {
              instance.saveQuestionState(instance._currentQuestion.id, state);
            }
        }, this);

        // Load the DOM container that houses the unit templates
        this.loadTemplateContainer();
        this._questionSetConfig = this._data.config ? JSON.parse(this._data.config.__cdata) : this._questionSetConfig;
        // this.setupNavigation();

        // Get all questions in the question set
        var quesArray = angular.copy(data[this._constants.questionPluginId]);
        this._masterQuestionSet = _.isArray(quesArray) ? quesArray : _.toArray({
            quesArray
        });

        // If this isn't the first time the question set is being rendered, restore its earlier state
        this._questionStates = {};
        this._renderedQuestions = [];
        var savedQSState = this.getQuestionSetState();
        if (savedQSState) {
            this._renderedQuestions = savedQSState.renderedQuestions;
            this._currentQuestion = savedQSState.currentQuestion;
            this._questionStates = savedQSState.questionStates;
            this._currentQuestionState = this.getQuestionState(this._currentQuestion.id);
        } else {
            this._currentQuestion = this.getNextQuestion();
        }
        this.saveQuestionSetState();

        // Render the question
        this.renderQuestion(this._currentQuestion);
    },
    renderQuestion: function (question) {
        var instance = this;

    // If this is not the first question, hide the current question
    if (this._currentQuestion) {
      EkstepRendererAPI.dispatchEvent(this._currentQuestion.pluginId + ':hide');
      jQuery('#' + this._currentQuestion.id).remove();
    }

        if (question.pluginId === this._constants.qsQuizPlugin) {
            // For V1 questions, invoke the 'questionset.quiz' plugin.
            // TODO: Move state saving of V1 questions from questionset.quiz to here, like V2 questions
            var ins = PluginManager.invoke(question.pluginId, question, this._stage, this._stage, this._theme);

            // Mark the question as rendered
            this._currentQuestion = question;
            this.setRendered(question);
            setTimeout(function () {
                Renderer.update = true;
            }, 500);
        } else {
            // For V2 questions, load the AngularJS template and controller and invoke the event to render the question

            // Mark the question as rendered
            this._currentQuestion = question;
            this.setRendered(question);

            // Fetch the question state if it was already rendered before
            this._currentQuestionState = this.getQuestionState(question.id);
            this.loadModules(question, function () {
                setTimeout(function () {                    
                    // Set current question for telmetry to log events from question-unit
                    QSTelemetryLogger.setQuestion(instance._currentQuestion, instance.getRenderedIndex());
                    
                    EkstepRendererAPI.dispatchEvent(question.pluginId + ':show', instance);
                    // instance.setupNavigation();
                }, 100);
            });
        }
    },
    setRendered: function (question) {
        var instance = this,
            element;

        // Mark the question as rendered in the _masterQuestionSet
        // This is to ensure that we do not re-render the same question twice (in case of shuffle)
        element = _.find(instance._masterQuestionSet, function (item) {
            return item.id === question.id;
        });
        element.rendered = true;

        // Add the rendered question to the _renderedQuestions array - this will be saved for future
        // when the question set may be re-rendered when revisiting the stage
        // This array also helps in navigation between already rendered questions.
        var renderedQuestion = _.find(instance._renderedQuestions, function (q) {
            return q.id === question.id
        });
        if (_.isUndefined(renderedQuestion)) {
            instance._renderedQuestions.push(question);
        }

        // Set first/last question flags
        this._firstQuestion = (this.getRenderedIndex() === 0);
        this._lastQuestion = (this._renderedQuestions.length + 1 >= this._questionSetConfig.total_items);

    },
    endOfQuestionSet: function () {
        return (this._renderedQuestions.length >= this._questionSetConfig.total_items);
    },
    nextQuestion: function () {
        // Trigger the evaluation for the question
        var instance = this;
        this._displayedTryAgain = false;
        EkstepRendererAPI.dispatchEvent(this._currentQuestion.pluginId + ":evaluate", function (result) {
            if (instance._questionSetConfig.show_feedback == true) {
                // Display feedback popup (tryagain or goodjob)
                // result.pass is added to handle sorting-template(Custom IEvaluator) issue. This can be generic solution for other
                instance.displayFeedback(result.eval? result.eval : result.pass );   

            } else {
                // If show_feedback is set to false, move to next question without displaying feedback popup
                instance.renderNextQuestion();
            }
        });
    },
    displayFeedback: function (res) {
        if (res === true) {
            EkstepRendererAPI.dispatchEvent('renderer:load:popup:goodJob');
        } else {
            EkstepRendererAPI.dispatchEvent('renderer:load:popup:tryAgain');
            this._displayedTryAgain = true;
        }
    },
    renderNextQuestion: function () {
        // Get the next question to be rendered
        var nextQ = this.getNextQuestion();
        if (nextQ) {
            this.renderQuestion(nextQ);
            this.generateNavigateTelemetry(null, this._currentQuestion.id);
        } else {
            // If no question is remaining, it is the end of the question set, move to next stage after
            // hiding the last question and some housekeeping
            this.saveQuestionSetState();
            this.generateNavigateTelemetry('next', 'ContentApp-EndScreen');
            EkstepRendererAPI.dispatchEvent(this._currentQuestion.pluginId + ':hide');
            // this.resetNavigation();
            this.resetListeners();
            this.resetTemplates();
            this.deregisterNavigation(instance);
            OverlayManager.skipAndNavigateNext();
        }
    },
    prevQuestion: function () {
        this.renderPrevQuestion();
    },
    renderPrevQuestion: function () {
        // Get the previous question to be rendered
        var prevQ = this.getPrevQuestion();
        if (prevQ) {
            this.renderQuestion(prevQ);
            this.generateNavigateTelemetry(null, this._currentQuestion);
        } else {
            // If no question is remaining, it is the beginning of the question set, move to previous stage after
            // hiding the first question and some housekeeping
            this.saveQuestionSetState();
            this.generateNavigateTelemetry('previous', 'ContentApp-StartScreen');
            EkstepRendererAPI.dispatchEvent(this._currentQuestion.pluginId + ':hide');
            // this.resetNavigation();
            this.resetListeners();
            this.resetTemplates();
            this.deregisterNavigation(instance);
            OverlayManager.navigatePrevious();
        }
    },
    getNextQuestion: function () {
        // Check if the next question has already been rendered (are we moving back and forth within the question set?)
        var renderIndex = this.getRenderedIndex();
        if ((renderIndex + 1 >= this._renderedQuestions.length) && !this.endOfQuestionSet()) {
            // The next question should be picked from the master question array, so fetch the list of all questions
            // that are NOT marked as 'rendered'
            var unRenderedQuestions = this._masterQuestionSet.filter(function (q) {
                return (_.isUndefined(q.rendered)) ? true : !q.rendered;
            });
            // If shuffle is on, return a random question from the list of NOT rendered questions
            if (this._questionSetConfig.shuffle_questions) {
                return _.sample(unRenderedQuestions);
            }
            // If shuffle is off, return the next question in the list
            return unRenderedQuestions.shift();
        } else {
            // If the next question has already been rendered, fetch it from the _renderedQuestions array
            return this._renderedQuestions[renderIndex + 1];
        }
    },
    getPrevQuestion: function () {
        // The previous question is always obtained from the _renderedQuestions array.
        // If the index becomes < 0, it means that we have already returned the first question
        // and can go back any further
        var renderIndex = this.getRenderedIndex();
        if (renderIndex - 1 < 0) {
            return undefined;
        }
        return this._renderedQuestions[renderIndex - 1];
    },
    getRenderedIndex: function () {
        var instance = this;
        var index = _.findIndex(this._renderedQuestions, function (q) {
            return q.id === instance._currentQuestion.id;
        });
        return index;
    },
    loadModules: function (question, callback) {
        this._questionUnitPlugins = _.union(this._questionUnitPlugins, [question.pluginId]);
        var instance = this;
        var getPluginManifest = org.ekstep.pluginframework.pluginManager.pluginObjs[question.pluginId];
        var unitTemplates = getPluginManifest._manifest.templates;
        var templateData = _.find(unitTemplates, function (template) {
            return template.id === question.templateId;
        });

        var pluginVer = (question.pluginVer === 1) ? '1.0' : question.pluginVer.toString();
        var templatePath = org.ekstep.pluginframework.pluginManager.resolvePluginResource(question.pluginId, pluginVer, templateData.renderer.template);
        var controllerPath = org.ekstep.pluginframework.pluginManager.resolvePluginResource(question.pluginId, pluginVer, templateData.renderer.controller);
        this.loadController(controllerPath, function (data) {
            instance.loadTemplate(templatePath, instance._constants.qsElement, instance._currentQuestion.id, function (data) {
                instance._loadedTemplates.push(templateData.id);
                callback();
            });
        });
    },
    loadController: function (path, callback) {
        setTimeout(function () {
            EkstepRendererAPI.dispatchEvent('renderer:load:js', {
                path: path,
                callback: callback
            });
        }, 400);
    },
    loadTemplate: function (path, toElement, questionId, callback) {
        setTimeout(function () {
            EkstepRendererAPI.dispatchEvent('renderer:load:html', {
                path: path,
                toElement: toElement,
                questionId: questionId,
                callback: callback
            });
        }, 400);
    },
    loadTemplateContainer: function () {
        var qsElement = angular.element(this._constants.qsElement);
        if (qsElement.length === 0) {
            angular.element('body').append(angular.element('<div id="' + this._constants.qsElement.replace('#', '') + '"></div>'));
        }
    },
    /*resetNavigation: function () {
        this.showDefaultNextNav();
        this.showDefaultPrevNav();
    },
    showDefaultPrevNav: function () {
        $('#qs-custom-prev').hide();
        // $('.nav-previous').show();
      EkstepRendererAPI.dispatchEvent('renderer:previous:show');
    },
    showDefaultNextNav: function () {
        $('#qs-custom-next').hide();
        // $('.nav-next').show();
      EkstepRendererAPI.dispatchEvent('renderer:next:show');
    },
    showCustomPrevNav: function () {
        var prevButton = $('#qs-custom-prev');
        var navigateToStage = EkstepRendererAPI.getStageParam('previous');
        var stage = EkstepRendererAPI.getCurrentStage();
        if (stage && !_.isUndefined(navigateToStage)) {
            // prevButton.attr("disabled", "disabled");
            prevButton.show();
            // $('.nav-previous').hide();
          EkstepRendererAPI.dispatchEvent('renderer:prev:hide');
        } else {
          if(this.getRenderedIndex() > 0) {
            // prevButton.attr("disabled", "disabled");
            prevButton.show();
            $('.nav-previous').hide();
            EkstepRendererAPI.dispatchEvent('renderer:prev:hide');
          } else {
            prevButton.hide();
            setTimeout(function () {
                console.log('show-prev');
              EkstepRendererAPI.dispatchEvent('renderer:previous:show');
            }, 500);
          }
        }
    },
    showCustomNextNav: function () {
        $('#qs-custom-next').show();
        // $('.nav-next').hide();
      EkstepRendererAPI.dispatchEvent('renderer:next:hide');
    },
    setupNavigation: function () {
        instance = this;

        // Next
        var next = angular.element('#qs-custom-next');
        if (next.length === 0) {
            var nextButton = $('.nav-next');
            var nextImageSrc = nextButton.find('img').attr('src');

            var customNextButton = $('<img />', {
                src: nextImageSrc,
                id: 'qs-custom-next',
                class: ''
            }).css(this._constants.nextCSS);
            customNextButton.on('click', function () {
                instance.nextQuestion();
            });
            customNextButton.appendTo('#gameArea');
        }

        // Prev
        var prev = angular.element('#qs-custom-prev')
        if (prev.length === 0) {
            var prevButton = $('.nav-previous');
            var prevImageSrc = prevButton.find('img').attr('src');

            var customPrevButton = $('<img />', {
                src: prevImageSrc,
                id: 'qs-custom-prev',
                class: ''
            }).css(this._constants.prevCSS);
            customPrevButton.on('click', function () {
                instance.prevQuestion();
            });
            customPrevButton.appendTo('#gameArea');
        }
        // Show Custom Navigation
        this.showCustomNextNav();
        this.showCustomPrevNav();
    },*/
    getQuestionState: function (questionId) {
        return this._questionStates[questionId];
    },
    getQuestionSetState: function () {
        return Renderer.theme.getParam(this._data.id);
    },
    saveQuestionState: function (questionId, state) {
        if (state) {
            var qsState = this.getQuestionSetState();
            qsState = _.isUndefined(qsState) ? {} : qsState;
            this._questionStates[questionId] = state;
            qsState.questionStates = this._questionStates;
            Renderer.theme.setParam(this._data.id, JSON.parse(JSON.stringify(qsState)));
        }
    },
    saveQuestionSetState: function () {
        var qsState = {
            masterQuestionSet: this._masterQuestionSet,
            renderedQuestions: this._renderedQuestions,
            currentQuestion: this._currentQuestion,
            questionStates: this._questionStates
        };
        Renderer.theme.setParam(this._data.id, JSON.parse(JSON.stringify(qsState)));
    },
    resetTemplates: function () {
        // Remove all templates loaded for the question set
        jQuery(this._constants.qsElement).remove();
    },
    resetQS: function () {
        // this.resetNavigation();
        Renderer.theme.setParam(this._data.id, undefined);
        if (this._currentQuestion) {
            EkstepRendererAPI.dispatchEvent(this._currentQuestion.pluginId + ':hide');
        }
        this.resetListeners();
    },
    resetListeners: function () {
        // The following code will unregister all event listeners added by the question unit plugins
        // This is to ensure that the event listeners do not overlap when there are two or more question sets
        // in the same content.
        this._questionUnitPlugins.forEach(function (qu) {
            for (key in EventBus.listeners) {
                if (key.indexOf(qu) !== -1) {
                    if (EventBus.listeners.hasOwnProperty(key)) {
                        EventBus.listeners[key] = undefined;
                    }
                }
            }
        });
    },
    generateNavigateTelemetry: function (buttonId, currentQuestion) {
        var instance = this;
        var stageTo, objid;
        var stageid = EkstepRendererAPI.getCurrentStageId();
        if (buttonId) {
            stageTo = EkstepRendererAPI.getCurrentStage().getParam(buttonId);
            objid = stageTo;
            objid = objid ? objid : currentQuestion;
            stageTo = stageTo ? stageTo : currentQuestion;
        } else {
            stageTo = stageid;
            objid = currentQuestion;
        }
        var data = {
            "type": "view",
            "subtype": "Paginate",
            "pageid": stageid,
            "uri": "",
            "visits": {
                "objid": objid,
                "objtype": ""
            }
        }
        TelemetryService.navigate(stageid, stageTo, data)
    },
    handleNext: function () {
      this.nextQuestion();
    },
    handlePrevious: function () {
      this.prevQuestion();
    },
    hasPrevious: function (navType) {
      if(this._currentQuestion) {
          if(navType === "next") {
            if(this._firstQuestion && this._displayedTryAgain) {
              return false;
            } else {
              return (this.getRenderedIndex() + 1) > 0;
            }
          } else {
            return (this.getRenderedIndex() - 1) > 0;
          }
      }
      return false;
    }
});
//# sourceURL=questionSetRenderer.js