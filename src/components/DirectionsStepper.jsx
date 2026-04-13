import { useEffect, useMemo, useState } from 'react';

function stepIcon(type, instruction) {

  const text = String(instruction || '').toLowerCase();



  if (text.includes('left')) return '↰';

  if (text.includes('right')) return '↱';

  if (text.includes('stair') || text.includes('climb')) return '↑';



  if (type === 'checkpoint') return '↑';



  if (text.includes('continue') || text.includes('straight') || text.includes('ahead')) return '→';



  return '↑';

}



function typeBadgeLabel(type) {

  if (type === 'outdoor') return 'OUTDOOR';

  if (type === 'indoor') return 'INDOOR';

  if (type === 'building_entry') return 'BUILDING ENTRY';

  if (type === 'checkpoint') return 'CHECKPOINT';

  return 'STEP';

}



function typeBadgeClasses(type) {

  if (type === 'outdoor') return 'bg-emerald-50 text-emerald-700 border-emerald-200';

  if (type === 'indoor') return 'bg-sky-50 text-sky-700 border-sky-200';

  if (type === 'building_entry') return 'bg-violet-50 text-violet-700 border-violet-200';

  if (type === 'checkpoint') return 'bg-amber-50 text-amber-800 border-amber-200';

  return 'bg-slate-50 text-slate-700 border-slate-200';

}



function iconTintClasses(type) {

  if (type === 'outdoor') return 'bg-emerald-50 text-emerald-700';

  if (type === 'indoor') return 'bg-sky-50 text-sky-700';

  if (type === 'building_entry') return 'bg-violet-50 text-violet-700';

  if (type === 'checkpoint') return 'bg-amber-50 text-amber-800';

  return 'bg-slate-100 text-slate-700';

}



function progressColor(type) {

  if (type === 'checkpoint') return '#BA7517';

  return '#1D9E75';

}



export default function DirectionsStepper({

  directions = [],

  destinationName,

  buildingName,

  targetFloorNumber,

  onFloorMapVisibilityChange,

  onFloorChange,

  onClose,


  onArrive,
}) {


  

  const [currentStep, setCurrentStep] = useState(0);

  const [currentFloor, setCurrentFloor] = useState(targetFloorNumber ?? null);



  const totalSteps = Array.isArray(directions) ? directions.length : 0;

  const atEnd = currentStep >= totalSteps;

  const activeStep = !atEnd && directions[currentStep] ? directions[currentStep] : null;

  

  const headerStepText = useMemo(() => {

    if (!totalSteps) return '';

    if (atEnd) return `Step ${totalSteps} of ${totalSteps}`;

    return `Step ${currentStep + 1} of ${totalSteps}`;

  }, [atEnd, currentStep, totalSteps]);



  const handleBack = () => {

    if (currentStep === 0) return;

    setCurrentStep((s) => Math.max(0, s - 1));

  };



  const handleNext = () => {

    if (atEnd) return;

    if (currentStep === totalSteps - 1) {

      setCurrentStep(totalSteps);

    } else {

      setCurrentStep((s) => Math.min(totalSteps, s + 1));

    }

  };



  const handleCheckpointConfirm = () => {

    if (!activeStep || activeStep.type !== 'checkpoint') return;

    if (typeof activeStep.targetFloor === 'number') {

      setCurrentFloor(activeStep.targetFloor);

      if (typeof onFloorChange === 'function') onFloorChange(activeStep.targetFloor);

    }

    handleNext();

  };



  const showArrivalScreen = atEnd && totalSteps > 0;



  const progressPercent = useMemo(() => {

    if (!totalSteps) return 0;

    const idx = Math.min(currentStep, totalSteps);

    return (idx / totalSteps) * 100;

  }, [currentStep, totalSteps]);



  const progressBarColor = progressColor(activeStep?.type);

  useEffect(() => {
    const shouldShowFloorMap =
      (activeStep?.type === 'indoor' || showArrivalScreen) &&
      (typeof targetFloorNumber !== 'number' || currentFloor === targetFloorNumber);

    if (typeof onFloorMapVisibilityChange === 'function') {
      onFloorMapVisibilityChange(Boolean(shouldShowFloorMap));
    }
  }, [activeStep?.type, currentFloor, onFloorMapVisibilityChange, showArrivalScreen, targetFloorNumber]);



  return (

    <aside

      className={[

        'fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-3xl',

        'rounded-t-3xl border border-slate-200 bg-white shadow-2xl',

        'transition-transform duration-300 ease-in-out',

        totalSteps ? 'translate-y-0' : 'translate-y-full'

      ].join(' ')}

      style={{ height: '58vh' }}

      role="dialog"

      aria-modal="true"

      aria-label="Directions"

    >
      <style>{`
        @keyframes floorPulse {
          0% { box-shadow: 0 0 0 0 rgba(27, 58, 107, 0.55); }

          100% { box-shadow: 0 0 0 8px rgba(27, 58, 107, 0); }

        }

      `}</style>



      <div className="flex items-center justify-center pt-2">

        <div className="h-1.5 w-12 rounded-full bg-slate-300" />

      </div>



      <div className="flex h-full flex-col px-4 pb-4 pt-3">

        <div className="mb-2 flex items-center justify-between gap-3">

          <div className="min-w-0">

            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To</div>

            <div className="truncate text-sm font-extrabold text-slate-900">

              {destinationName || 'Destination'}

            </div>

          </div>

          {totalSteps > 0 && (

            <div className="text-xs font-semibold text-slate-500">{headerStepText}</div>

          )}

        </div>



        <div className="mb-2 flex items-center justify-between gap-3">

          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">

            <div

              className="h-full rounded-full"

              style={{

                width: `${progressPercent}%`,

                backgroundColor: progressBarColor,

                transition: 'width 0.25s ease-out'

              }}

            />

          </div>

          {currentFloor !== null && (

            <div className="ml-3 flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">

              <span

                className="h-2 w-2 rounded-full bg-primary"

                style={{ animation: 'floorPulse 1.4s ease-out infinite' }}

              />

              <span>Floor {currentFloor}</span>

            </div>

          )}

        </div>



        <div className="mb-2 flex items-center justify-between">

          {buildingName && (

            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">

              {buildingName}

            </div>

          )}

          <button

            type="button"

            className="rounded-xl px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"

            onClick={() => {

              if (typeof onClose === 'function') onClose();

            }}

          >

            Close

          </button>

        </div>



        <div className="min-h-0 flex-1 overflow-auto pt-1">

          {showArrivalScreen ? (

            <ArrivalView

              destinationName={destinationName}

              buildingName={buildingName}

              floorNumber={currentFloor ?? targetFloorNumber}

              onArrive={onArrive}

            />

          ) : activeStep ? (

            <StepCard

              step={activeStep}

              stepIndex={currentStep}

              totalSteps={totalSteps}

              onBack={handleBack}

              onNext={handleNext}

              onCheckpointConfirm={handleCheckpointConfirm}

              isFirst={currentStep === 0}

              isLast={currentStep === totalSteps - 1}

            />

          ) : (

            <div className="text-center text-sm text-slate-500">No directions available.</div>

          )}

        </div>



        {totalSteps > 0 && !showArrivalScreen && (

          <div className="mt-3 flex items-center justify-center gap-1.5">

            {directions.map((_, idx) => {

              const active = idx === currentStep;

              return (

                <div

                  key={idx}

                  className={

                    active

                      ? 'h-2 w-5 rounded-full bg-primary'

                      : 'h-2 w-2 rounded-full border border-slate-300'

                  }

                />

              );

            })}

          </div>

        )}

      </div>

    </aside>

  );

}



function StepCard({

  step,

  stepIndex,

  totalSteps,

  onBack,

  onNext,

  onCheckpointConfirm,

  isFirst,

  isLast

}) {

  const isCheckpoint = step.type === 'checkpoint';

  const icon = stepIcon(step.type, step.instruction);



  const nextLabel = isLast ? 'Arrive ✓' : 'Next →';



  const containerClasses = [

    'rounded-2xl border px-3 py-3',

    isCheckpoint ? 'border-amber-300 bg-[#FFFBF2]' : 'border-slate-200 bg-slate-50'

  ].join(' ');



  return (

    <div className={containerClasses}>

      <div className="mb-2 flex items-center justify-between">

        <span

          className={[

            'rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide',

            isCheckpoint ? 'bg-amber-50 text-amber-800 border-amber-200' : typeBadgeClasses(step.type)

          ].join(' ')}

        >

          {isCheckpoint ? 'FLOOR TRANSITION' : typeBadgeLabel(step.type)}

        </span>

        <span className="text-[11px] font-semibold text-slate-500">

          Step {stepIndex + 1} of {totalSteps}

        </span>

      </div>



      <div className="flex gap-3">

        <div

          className={[

            'flex h-10 w-10 items-center justify-center rounded-2xl text-lg font-bold',

            iconTintClasses(step.type)

          ].join(' ')}

        >

          {icon}

        </div>

        <div className="min-w-0 flex-1">

          <div className="text-sm font-semibold text-slate-900">

            {step.instruction || 'Follow the indicated path.'}

          </div>

          {step.hint && (

            <div className="mt-1 text-xs text-slate-600">{step.hint}</div>

          )}

          {step.landmark && (

            <div className="mt-1 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">

              {step.landmark}

            </div>

          )}

        </div>

      </div>



      {isCheckpoint && (

        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs">

          <div className="font-semibold text-amber-900">

            {step.confirmText || 'Have you reached this checkpoint and changed floors?'}

          </div>

          {step.confirmSub && (

            <div className="mt-1 text-[11px] text-amber-800">{step.confirmSub}</div>

          )}

        </div>

      )}

      <div className="mt-3 flex items-center justify-between gap-2">

        <button

          type="button"

          onClick={onBack}

          disabled={isFirst}

          className={[

            'flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold',

            isFirst

              ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'

              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'

          ].join(' ')}

        >

          ← Back

        </button>



        {isCheckpoint ? (

          <button

            type="button"

            onClick={onCheckpointConfirm}

            className="flex-1 rounded-2xl bg-amber-500 px-3 py-2 text-sm font-extrabold text-white hover:brightness-95"

          >

            Yes, I'm on Floor {step.targetFloor ?? ''}

          </button>

        ) : (

          <button

            type="button"

            onClick={onNext}

            className="flex-1 rounded-2xl bg-primary px-3 py-2 text-sm font-extrabold text-white hover:brightness-95"

          >

            {nextLabel}

          </button>

        )}

      </div>

    </div>

  );

}



function ArrivalView({ destinationName, buildingName, floorNumber, onArrive }) {

  return (

    <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">

      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-2xl text-white">

        ✓

      </div>

      <div className="text-base font-extrabold text-emerald-900">You have arrived!</div>

      <div className="mt-1 text-sm text-emerald-800">

        {destinationName || 'Destination'}

        {buildingName ? ` · ${buildingName}` : ''}

        {typeof floorNumber === 'number' ? ` · Floor ${floorNumber}` : ''}

      </div>

      <button

        type="button"

        className="mt-4 w-full max-w-xs rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white hover:brightness-95"

        onClick={() => {

          if (typeof onArrive === 'function') onArrive();

        }}

      >

        Done

      </button>

    </div>

  );

}



